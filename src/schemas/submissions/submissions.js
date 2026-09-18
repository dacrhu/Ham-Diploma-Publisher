// Submissions/Submissions — a rádióamatőr saját beadványainak listázása/
// megtekintése. A LÉTREHOZÁS (napló feltöltés + rule-engine kiértékelés) NEM
// ezen a sémán keresztül megy — a multipart file upload miatt egy sima
// controller-actionben történik (lásd controllers/submissions.js
// upload_submission), ugyanaz a minta, mint a diploma biankó kép feltöltésénél
// (controllers/diplomas-admin.js upload_blank, nem Diplomas/Diplomas action).

NEWSCHEMA('Submissions/Submissions', function (schema) {

    // A bejelentkezett user SAJÁT beadványainak listája — nincs `permissions`
    // megkötés (bármelyik bejelentkezett user jogosult a sajátjaira), a
    // Users/Users get/save mintáját követve (lásd schemas/users/users.js).
    schema.action('query', {
        language: true,
        action: async function ($) {
            if (!$.user) {
                $.callback({ success: false });
                return;
            }

            let page = Number($.query.page) || 0;
            let max = Number($.query.max) || 25;

            let result = await MDB.find(process.env.MONGODB_DB_NAME, 'submissions', { userId: $.user._id }, {
                projection: { qsoBreakdown: 0, autoCheckDetails: 0 },
                skip: page * max
            }, { created: -1 }, max, true);

            if (isDbError(result)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            await attachDiplomaInfo(result.data);

            $.callback({ success: true, countFull: result.countFull, data: result.data });
        }
    });

    // Superadmin-only: egy TETSZŐLEGES felhasználó beadványai — a
    // /admin/users/{id} felhasználó-adatlaphoz kell (lásd
    // schemas/users/users.js adminGet/adminList — felhasználói kérésre), NEM
    // a saját, `$.user._id`-hez kötött `query` actiont bővítettem ki, hogy az
    // ne kaphasson (akár csak elvi) jogosultság-kikerülési lehetőséget.
    schema.action('adminForUser', {
        language: true,
        action: async function ($) {
            if (!$.user || !$.user.sa) {
                $.callback({ success: false });
                return;
            }

            let page = Number($.query.page) || 0;
            let max = Number($.query.max) || 25;

            let result = await MDB.find(process.env.MONGODB_DB_NAME, 'submissions', { userId: $.params.id }, {
                projection: { qsoBreakdown: 0, autoCheckDetails: 0 },
                skip: page * max
            }, { created: -1 }, max, true);

            if (isDbError(result)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            await attachDiplomaInfo(result.data);

            $.callback({ success: true, countFull: result.countFull, data: result.data });
        }
    });

    schema.action('get', {
        language: true,
        action: async function ($) {
            if (!$.user) {
                $.callback({ success: false });
                return;
            }

            let submission = await MDB.findOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID($.params.id) });

            if (isDbError(submission) || !submission) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.submission.notfound') });
                return;
            }

            if (!(await canAccessSubmission($.user, submission))) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.submission.forbidden') });
                return;
            }

            await attachDiplomaInfo([submission]);

            $.callback({ success: true, data: submission });
        }
    });

    // Manager review-sor (8. lépés) — a plain manager csak a HOZZÁ rendelt
    // diplomák beadványait látja (lásd managedDiplomaIds), a superadmin mindet.
    // Alapértelmezett szűrés `pending_review`-ra (ez a tényleges "várólista"),
    // `?status=all` esetén nincs szűrés, egyébként a megadott konkrét státuszra.
    schema.action('reviewQueue', {
        permissions: ['manager'],
        language: true,
        action: async function ($) {
            let query = {};

            if (!$.user.sa) {
                let diplomaIds = await managedDiplomaIds($.user._id);

                if (!diplomaIds.length) {
                    $.callback({ success: true, countFull: 0, data: [] });
                    return;
                }

                query.diplomaId = { $in: diplomaIds };
            }

            if (!$.query.status)
                query.status = 'pending_review';
            else if ($.query.status !== 'all')
                query.status = $.query.status;

            let page = Number($.query.page) || 0;
            let max = Number($.query.max) || 25;

            let result = await MDB.find(process.env.MONGODB_DB_NAME, 'submissions', query, {
                projection: { qsoBreakdown: 0, autoCheckDetails: 0 },
                skip: page * max
            }, { created: -1 }, max, true);

            if (isDbError(result)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            await attachDiplomaInfo(result.data);
            await attachApplicantInfo(result.data);

            $.callback({ success: true, countFull: result.countFull, data: result.data });
        }
    });

    // Kézi pontkorrekció — csak `pending_review` állapotban (a QSL-mintavételezésre
    // váró, illetve a már elbírált beadványoknál nincs értelme). Egy manualAdjustments
    // bejegyzés kerül a listához (nem felülírás), a totalPoints pedig
    // autoTotalPoints + az ÖSSZES korrekció összegeként számolódik újra — így a
    // teljes korrekciós történet megmarad, visszakövethető. Opcionálisan egy
    // KONKRÉT QSO-hoz köthető (`qsoRef` — a qsoBreakdown tömbindexe, NEM önálló
    // Mongo-id, lásd a fájl tetejének kommentjét), hogy pl. egy olyan QSO is
    // kaphasson pontot, amit az automatikus szabály-illesztés kihagyott (pl. a
    // COMMENT nem tartalmazta szó szerint a "YL" jelölést, de a manager tudja,
    // hogy releváns). `qsoRef` nélkül a korrekció a teljes beadványra vonatkozik
    // (nem QSO-specifikus, pl. egyéb méltányossági pont).
    // A `ruleIndex` (opcionális) esetén a pontérték NEM a kliensből jön — a
    // diploma AKTUÁLIS `matchRules[ruleIndex].points`-ából olvasunk, hogy a kézi
    // korrekció mindig a ténylegesen konfigurált szabály-pontértékkel legyen
    // konzisztens (a kliens csak a `reason` szöveget adja, amit a
    // controllers/submissions.js view_detail által előre kiszámolt, lokalizált
    // szabály-leírásból tölt ki — lásd describeMatchedRule ottani hívását).
    schema.action('adjustPoints', {
        permissions: ['manager'],
        input: 'qsoRef:string, amount:number, reason:string, ruleIndex:number',
        language: true,
        action: async function ($) {
            let submission = await MDB.findOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID($.params.id) });

            if (isDbError(submission) || !submission) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.submission.notfound') });
                return;
            }

            let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) }, { projection: { managerId: 1, matchRules: 1 } });

            if (!isReviewerOf($.user, submission, diploma)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.submission.forbidden') });
                return;
            }

            if (submission.status !== 'pending_review') {
                $.callback({ success: false, message: RESOURCE($.language, 'error.submission.review.state') });
                return;
            }

            let hasRule = $.model.ruleIndex !== undefined && $.model.ruleIndex !== null && String($.model.ruleIndex) !== '';
            let amount;

            if (hasRule) {
                let rules = Array.isArray(diploma.matchRules) ? diploma.matchRules : [];
                let rule = rules[Number($.model.ruleIndex)];

                if (!rule) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.submission.review.rule') });
                    return;
                }

                amount = rule.points;
            } else {
                amount = Number($.model.amount);

                if (!isFinite(amount) || amount === 0) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.submission.review.amount') });
                    return;
                }
            }

            let qsoRef = ($.model.qsoRef != null && String($.model.qsoRef).trim() !== '') ? String($.model.qsoRef).trim() : null;

            if (qsoRef != null) {
                let qsoExists = Array.isArray(submission.qsoBreakdown) && submission.qsoBreakdown.some(q => String(q.qsoRef) === qsoRef);

                if (!qsoExists) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.submission.notfound') });
                    return;
                }
            }

            let manualAdjustments = Array.isArray(submission.manualAdjustments) ? submission.manualAdjustments : [];
            manualAdjustments.push({ qsoRef: qsoRef, amount: amount, reason: ($.model.reason || '').trim() || null, ruleBased: hasRule, managerId: $.user._id, at: new Date() });

            let totalPoints = computeTotalPoints(submission.qsoBreakdown, manualAdjustments);

            let update = await MDB.updateOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID($.params.id) }, {
                manualAdjustments: manualAdjustments,
                totalPoints: totalPoints,
                updated: new Date()
            });

            if (isDbError(update)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            FUNC.logger($, `Submissions/Submissions adjustPoints: ${$.params.id} qsoRef=${qsoRef == null ? '-' : qsoRef} amount=${amount} -> totalPoints=${totalPoints} (manager ${$.user._id})`);
            $.callback({ success: true, totalPoints: totalPoints, manualAdjustments: manualAdjustments });
        }
    });

    // Elfogadás/elutasítás — csak `pending_review` állapotból indulhat (a QSL-re
    // váró beadvány nem bírálható el, lásd controllers/submissions.js
    // upload_qsl kommentjét: amíg nincs meg minden QSL-kép, nem is kerül ide).
    // A döntés VÉGLEGES ezen a lépésen belül (nincs "vissza pending_review-ba"
    // action) — a PDF-generálás (9. lépés) az `approved` státuszra épül majd.
    schema.action('decide', {
        permissions: ['manager'],
        input: '*decision:string, remark:string',
        language: true,
        action: async function ($) {
            if (['approve', 'reject'].indexOf($.model.decision) === -1) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.submission.review.decision') });
                return;
            }

            let submission = await MDB.findOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID($.params.id) });

            if (isDbError(submission) || !submission) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.submission.notfound') });
                return;
            }

            let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) });

            if (!isReviewerOf($.user, submission, diploma)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.submission.forbidden') });
                return;
            }

            if (submission.status !== 'pending_review') {
                $.callback({ success: false, message: RESOURCE($.language, 'error.submission.review.state') });
                return;
            }

            let remark = ($.model.remark || '').trim() || null;

            let applicant = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(submission.userId) }, {
                projection: { email: 1, firstName: 1, lastName: 1, language: 1, callsign: 1 }
            });

            if (isDbError(applicant) || !applicant) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            let result;

            if ($.model.decision === 'approve') {
                result = await approveSubmission($, submission, diploma, applicant, $.user._id, remark);
            } else {
                result = await rejectSubmission($, submission, remark, applicant, $.user._id);
            }

            if (result.error) {
                $.callback({ success: false, message: result.error });
                return;
            }

            FUNC.logger($, `Submissions/Submissions decide: ${$.params.id} -> ${result.status}${result.serialNumber ? ` (serial ${result.serialNumber})` : ''} (manager ${$.user._id})`);
            $.callback({ success: true, status: result.status, serialNumber: result.serialNumber || null });
        }
    });

    // A beadvány TULAJDONOSA indítja — Stripe Checkout / PayPal Order
    // létrehozása (a diploma ténylegesen felkínált `paymentMethods`-ai közül),
    // vagy banki utalás esetén csak a diploma bankszámla-adatainak
    // visszaadása + a `submission.payment` "pending" jelölése (a tényleges
    // jóváhagyás a manager `confirmBankTransfer` actionje). A tényleges
    // Stripe/PayPal fizetés-megerősítés NEM itt, hanem a
    // controllers/payments.js webhookjaiban/return-oldalaiban történik (azok
    // nem $.user-hez kötött külső hívások — a séma-action réteg csak az
    // INDÍTÁST végzi).
    schema.action('pay', {
        input: '*provider:string',
        language: true,
        action: async function ($) {
            if (!$.user) {
                $.callback({ success: false });
                return;
            }

            let submission = await MDB.findOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID($.params.id) });

            if (isDbError(submission) || !submission) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.submission.notfound') });
                return;
            }

            if (submission.userId !== $.user._id) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.submission.forbidden') });
                return;
            }

            if (submission.status !== 'awaiting_payment') {
                $.callback({ success: false, message: RESOURCE($.language, 'error.payment.state') });
                return;
            }

            let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) });

            if (isDbError(diploma) || !diploma || (diploma.paymentMethods || []).indexOf($.model.provider) === -1) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.payment.method') });
                return;
            }

            let amount = PAYMENT_PRICING.calculateFee(diploma, submission.deliveryChoice);
            let currency = diploma.pricing.currency;
            // Emberi léptékű, egyedi fizetési hivatkozás — a sorszám ekkorra
            // már ki van osztva (a decide action a PDF-generálással EGYÜTT,
            // a fizetési állapottól függetlenül kiosztja, lásd issueCertificate()
            // fent), úgyhogy erre hivatkozhatunk a nyers Mongo _id helyett.
            let reference = submission.serialNumber ? String(submission.serialNumber) : String(submission._id);

            if ($.model.provider === 'stripe') {
                if (!STRIPE) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.payment.unavailable') });
                    return;
                }

                try {
                    let session = await STRIPE.checkout.sessions.create({
                        mode: 'payment',
                        payment_method_types: ['card'],
                        line_items: [{
                            price_data: {
                                currency: currency.toLowerCase(),
                                product_data: { name: diploma.name },
                                unit_amount: PAYMENT_PRICING.toMinorUnits(amount)
                            },
                            quantity: 1
                        }],
                        success_url: FUNC.emailLink(`/payments/stripe/return/${submission._id}?session_id={CHECKOUT_SESSION_ID}`),
                        cancel_url: FUNC.emailLink(`/submissions/${submission._id}?payment=cancelled`),
                        client_reference_id: String(submission._id),
                        metadata: { submissionId: String(submission._id) }
                    });

                    $.callback({ success: true, redirectUrl: session.url });
                } catch (e) {
                    FUNC.logger($, `Submissions/Submissions pay: Stripe error (submission ${submission._id}): ${e.message}`);
                    $.callback({ success: false, message: RESOURCE($.language, 'error.payment.unavailable') });
                }

                return;
            }

            if ($.model.provider === 'paypal') {
                if (!PAYPAL_CLIENT.isConfigured()) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.payment.unavailable') });
                    return;
                }

                try {
                    let order = await PAYPAL_CLIENT.createOrder(
                        amount, currency, String(submission._id),
                        FUNC.emailLink(`/payments/paypal/return/${submission._id}`),
                        FUNC.emailLink(`/submissions/${submission._id}?payment=cancelled`)
                    );

                    if (!order.approveUrl)
                        throw new Error('missing approve link');

                    await MDB.updateOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: submission._id }, {
                        payment: { provider: 'paypal', providerRef: order.orderId, amount: amount, currency: currency, status: 'pending', paidAt: null },
                        updated: new Date()
                    });

                    $.callback({ success: true, redirectUrl: order.approveUrl });
                } catch (e) {
                    FUNC.logger($, `Submissions/Submissions pay: PayPal error (submission ${submission._id}): ${e.message}`);
                    $.callback({ success: false, message: RESOURCE($.language, 'error.payment.unavailable') });
                }

                return;
            }

            if ($.model.provider === 'bank_transfer') {
                await MDB.updateOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: submission._id }, {
                    payment: { provider: 'bank_transfer', providerRef: null, amount: amount, currency: currency, status: 'pending', paidAt: null },
                    updated: new Date()
                });

                $.callback({ success: true, bankDetails: diploma.bankTransferDetails, reference: reference, amount: amount, currency: currency });
                return;
            }

            $.callback({ success: false, message: RESOURCE($.language, 'error.payment.method') });
        }
    });

    // Manager MANUÁLIS jóváhagyása — kizárólag banki utalásnál kell (a
    // Stripe/PayPal fizetéseket a webhook/return-oldal automatikusan
    // megerősíti, lásd controllers/payments.js), de szándékosan nem kötöttük
    // a `submission.payment.provider === 'bank_transfer'`-hez sem: ha egy
    // Stripe/PayPal webhook valamiért nem érkezne meg (pl. helyi fejlesztői
    // környezetben nincs publikus URL), a manager így KÉZZEL is lezárhatja,
    // miután a fizetést más úton (pl. a Stripe/PayPal admin-felületén)
    // ellenőrizte.
    schema.action('confirmBankTransfer', {
        permissions: ['manager'],
        language: true,
        action: async function ($) {
            let submission = await MDB.findOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID($.params.id) });

            if (isDbError(submission) || !submission) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.submission.notfound') });
                return;
            }

            let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) });

            if (!isReviewerOf($.user, submission, diploma)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.submission.forbidden') });
                return;
            }

            if (submission.status !== 'awaiting_payment') {
                $.callback({ success: false, message: RESOURCE($.language, 'error.payment.state') });
                return;
            }

            let amount = PAYMENT_PRICING.calculateFee(diploma, submission.deliveryChoice);
            let currency = diploma.pricing.currency;

            let update = await MDB.updateOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: submission._id }, {
                status: 'paid',
                payment: { provider: 'bank_transfer', providerRef: null, amount: amount, currency: currency, status: 'paid', paidAt: new Date() },
                updated: new Date()
            });

            if (isDbError(update)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            await notifyPaymentConfirmed($, submission);

            FUNC.logger($, `Submissions/Submissions confirmBankTransfer: ${$.params.id} -> paid (manager ${$.user._id})`);
            $.callback({ success: true, status: 'paid' });
        }
    });

    // Fizikai kézbesítésnél a fizetés után még hátra van a nyomtatás/
    // keretezés/postázás — ezt a manager jelöli "teljesítve"-nek, miután
    // ténylegesen elküldte. PDF-only kézbesítésnél nincs értelme (a `paid`
    // már önmagában is a folyamat vége — a letöltés a fizetés
    // megtörténtével már elérhető, lásd serve_diploma_pdf).
    schema.action('markCompleted', {
        permissions: ['manager'],
        language: true,
        action: async function ($) {
            let submission = await MDB.findOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID($.params.id) });

            if (isDbError(submission) || !submission) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.submission.notfound') });
                return;
            }

            let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) });

            if (!isReviewerOf($.user, submission, diploma)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.submission.forbidden') });
                return;
            }

            if (submission.status !== 'paid' || submission.deliveryChoice !== 'physical') {
                $.callback({ success: false, message: RESOURCE($.language, 'error.payment.state') });
                return;
            }

            let update = await MDB.updateOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: submission._id }, {
                status: 'completed',
                updated: new Date()
            });

            if (isDbError(update)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            FUNC.logger($, `Submissions/Submissions markCompleted: ${$.params.id} -> completed (manager ${$.user._id})`);
            $.callback({ success: true, status: 'completed' });
        }
    });
});

function isDbError(result) {
    return Array.isArray(result) && result[0] != null && result[0].error != null;
}

// Tulajdonos, a diploma felelős managere, vagy superadmin láthatja (a
// manager-review UI, 8. lépés, ugyanezt a szabályt használja megtekintésre).
async function canAccessSubmission(user, submission) {
    if (user.sa || submission.userId === user._id)
        return true;

    let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) }, { projection: { managerId: 1 } });
    return !!(diploma && diploma.managerId && diploma.managerId === user._id);
}

// A reviewQueue/adjustPoints/decide actionöknek: superadmin VAGY a diploma
// hozzárendelt managere dönthet/korrigálhat — a beadvány TULAJDONOSA itt
// szándékosan NEM elég, ellentétben canAccessSubmission-nel (az a megtekintést
// engedi tulajdonosnak is, ez itt a tényleges elbírálást). A TULAJDONOS SOSE
// reviewer itt, MÉG AKKOR SEM, ha egyébként sa/manager (senki nem bírálhatja el
// a saját beadványát — felhasználói visszajelzés nyomán bevezetett szabály,
// lásd controllers/submissions.js view_detail ugyanezen, UI-oldali tükrét).
// KIVÉTEL: `DEBUG` módban (Total.js global, csak fejlesztői környezetben igaz)
// a tulajdonos IS reviewernek számít, ha egyébként sa/a diploma managere —
// felhasználói kérésre, hogy egyetlen teszt-manager-fiókkal is végig lehessen
// próbálni az elbírálást. ÉLES (nem-DEBUG) környezetben ez sose fut.
function isReviewerOf(user, submission, diploma) {
    if (submission.userId === user._id && !DEBUG)
        return false;

    if (user.sa)
        return true;

    return !!(diploma && diploma.managerId && diploma.managerId === user._id);
}

// A managerhez rendelt diplomák _id-jait adja vissza STRING formában (a
// submissions.diplomaId is string — lásd controllers/submissions.js
// upload_submission `diplomaId: String(diploma._id)` mentését), a reviewQueue
// action diploma-szűréséhez.
async function managedDiplomaIds(userId) {
    let diplomas = await MDB.find(process.env.MONGODB_DB_NAME, 'diplomas', { managerId: userId }, { projection: { _id: 1 } });

    if (isDbError(diplomas))
        return [];

    return diplomas.map(d => String(d._id));
}

// A diploma nevét/típusát oldja fel minden beadványra, ugyanaz a minta, mint
// a schemas/diplomas/diplomas.js attachManagerInfo()-ja (szándékosan külön
// másolat, nem közös modul — lásd ott a kommentet).
async function attachDiplomaInfo(submissions) {
    let ids = submissions.map(s => s.diplomaId).filter(id => id);

    if (!ids.length)
        return;

    let diplomas = await MDB.find(process.env.MONGODB_DB_NAME, 'diplomas', { _id: { $in: ids.map(id => MDB.ObjectID(id)) } }, {
        projection: { name: 1, type: 1 }
    });

    if (isDbError(diplomas))
        return;

    let byId = {};
    for (let i = 0, n = diplomas.length; i < n; i++) {
        byId[String(diplomas[i]._id)] = diplomas[i];
    }

    for (let i = 0, n = submissions.length; i < n; i++) {
        let diploma = submissions[i].diplomaId && byId[submissions[i].diplomaId];
        submissions[i].diplomaInfo = diploma ? { name: diploma.name, type: diploma.type || 'standard' } : null;
    }
}

// A beküldő hívójelét/e-mailét oldja fel minden beadványra — a reviewQueue
// listának kell (a manager tudja, ki adta be), a saját "Beadványaim" listánál
// (query action) nincs értelme, azt szándékosan nem hívja.
async function attachApplicantInfo(submissions) {
    let ids = submissions.map(s => s.userId).filter(id => id);

    if (!ids.length)
        return;

    let users = await MDB.find(process.env.MONGODB_DB_NAME, 'users', { _id: { $in: ids.map(id => MDB.ObjectID(id)) } }, {
        projection: { email: 1, callsign: 1 }
    });

    if (isDbError(users))
        return;

    let byId = {};
    for (let i = 0, n = users.length; i < n; i++) {
        byId[String(users[i]._id)] = users[i];
    }

    for (let i = 0, n = submissions.length; i < n; i++) {
        let user = submissions[i].userId && byId[submissions[i].userId];
        submissions[i].applicantInfo = user ? { email: user.email, callsign: user.callsign } : null;
    }
}

// A manager döntéséről (elfogadás/elutasítás) e-mail értesítés a beküldőnek —
// SAJÁT nyelvén (users.language, a regisztrációkor mentett érték), NEM a
// döntést hozó manager nyelvén (lásd schemas/users/users.js formatName()-jét,
// itt szándékosan külön másolat). Hibát csak logol, a döntést magát nem
// bukja el (ugyanaz a minta, mint a users.js összes MAIL() hívásánál). A
// `user`-t a hívó (decide action) adja át — ugyanazt a lekérdezést egyébként
// az `issueCertificate()`-nek is ki kellene fizetnie, felesleges duplikálni.
async function notifyDecision($, submission, status, remark, user) {
    let language = user.language || 'hu';
    // 'awaiting_payment' is a jóváhagyás ÁGA (csak fizetendő díj miatt nem
    // 'approved' a végleges státusz, lásd decide action) — az e-mail
    // szövegezése szempontjából ugyanaz, mint 'approved'.
    let key = (status === 'approved' || status === 'awaiting_payment') ? 'approved' : 'rejected';

    MAIL(user.email, RESOURCE(language, `email.submission.${key}.subject`), 'submissions/email-decision', {
        greeting: RESOURCE(language, 'email.greeting'),
        name: formatName(language, user.firstName, user.lastName),
        intro: RESOURCE(language, `email.submission.${key}.intro`),
        remark: remark,
        remark_label: RESOURCE(language, 'submissions.detail.review.remark'),
        btn_label: RESOURCE(language, `email.submission.${key}.btn`),
        submission_link: FUNC.emailLink(`/submissions/${submission._id}`),
        footer: RESOURCE(language, 'email.footer')
    }, language, function (err) {
        if (err) FUNC.logger($, `Email ERROR (submission decision): ${user.email} -> ${err}`);
    });
}

// A beérkezett fizetésről szóló e-mail — a `confirmBankTransfer` action és a
// controllers/payments.js webhook/return-kezelői is hívják (utóbbiak
// `$`-kontextus NÉLKÜL futnak, ezért a `$` paraméter opcionális — csak a
// hibalogoláshoz kell, aminek hiányában `console.log`-ra esik vissza).
async function notifyPaymentConfirmed($, submission) {
    let user = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(submission.userId) }, {
        projection: { email: 1, firstName: 1, lastName: 1, language: 1 }
    });

    if (isDbError(user) || !user)
        return;

    let language = user.language || 'hu';

    MAIL(user.email, RESOURCE(language, 'email.payment.paid.subject'), 'submissions/email-decision', {
        greeting: RESOURCE(language, 'email.greeting'),
        name: formatName(language, user.firstName, user.lastName),
        intro: RESOURCE(language, 'email.payment.paid.intro'),
        remark: null,
        remark_label: RESOURCE(language, 'submissions.detail.review.remark'),
        btn_label: RESOURCE(language, 'email.payment.paid.btn'),
        submission_link: FUNC.emailLink(`/submissions/${submission._id}`),
        footer: RESOURCE(language, 'email.footer')
    }, language, function (err) {
        if (err) {
            let message = `Email ERROR (payment confirmed): ${user.email} -> ${err}`;
            $ ? FUNC.logger($, message) : console.log(message);
        }
    });
}

// Értesítés a managernek (vagy - ha a diplománál nincs kijelölt manager -
// az összes superadminnak), hogy egy beadvány elbírálásra vár. KIZÁRÓLAG
// akkor hívandó, amikor egy beadvány EBBEN a pillanatban lép
// 'pending_review' állapotba ÉS a diploma NEM autoApprove (lásd a hívási
// pontokat: controllers/submissions.js upload_submission - nincs
// QSL-mintavételezés - és upload_qsl - QSL-mintavételezésnél az UTOLSÓ kép
// feltöltésekor). autoApprove esetén sosem hívjuk, hiszen ott a beadvány
// azonnal tovább is lép, nincs emberi döntésre váró állapot. Ha a diplomán
// nincs managerId (még nem lett kijelölve), nincs más "ki felelős ezért"
// fogalom a projektben, ezért az ÖSSZES superadmin kap értesítést - hiba
// esetén csak logol, nem bukik el semmi (ugyanaz a minta, mint a fájl
// többi MAIL() hívásánál).
//
// A levél NYELVE szándékosan a BEADÓ rádióamatőr (submission.userId) saját
// nyelve, NEM a címzett (manager/superadmin) saját beállítása - felhasználói
// kérésre (2026-09-18), mert korábban a címzett nyelvén ment ki, és emiatt
// ugyanarról a beadványról hol magyar, hol angol levél érkezett, attól
// függően, kinek milyen nyelv volt a fiókján beállítva. Ha az amatőr nyelve
// valamiért nem határozható meg, a fallback 'en' - ez ELTÉR a projekt
// általános 'hu' defaultjától (lásd 02_localization.js), de itt szándékos,
// szintén felhasználói kérésre.
async function notifyManagerReviewNeeded($, submission, diploma) {
    let applicant = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(submission.userId) }, {
        projection: { language: 1 }
    });
    let language = (!isDbError(applicant) && applicant && applicant.language) || 'en';

    let recipients = [];

    if (diploma.managerId) {
        let manager = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(diploma.managerId) }, {
            projection: { email: 1, firstName: 1, lastName: 1 }
        });

        if (!isDbError(manager) && manager)
            recipients.push(manager);
    }

    if (!recipients.length) {
        let superadmins = await MDB.find(process.env.MONGODB_DB_NAME, 'users', { sa: true }, {
            projection: { email: 1, firstName: 1, lastName: 1 }
        });

        if (!isDbError(superadmins))
            recipients = superadmins;
    }

    for (let i = 0, n = recipients.length; i < n; i++) {
        let user = recipients[i];

        MAIL(user.email, RESOURCE(language, 'email.submission.review_needed.subject'), 'submissions/email-decision', {
            greeting: RESOURCE(language, 'email.greeting'),
            name: formatName(language, user.firstName, user.lastName),
            intro: RESOURCE(language, 'email.submission.review_needed.intro').replace('{0}', diploma.name),
            remark: null,
            remark_label: RESOURCE(language, 'submissions.detail.review.remark'),
            btn_label: RESOURCE(language, 'email.submission.review_needed.btn'),
            submission_link: FUNC.emailLink(`/submissions/${submission._id}`),
            footer: RESOURCE(language, 'email.footer')
        }, language, function (err) {
            if (err) {
                let message = `Email ERROR (review needed): ${user.email} -> ${err}`;
                $ ? FUNC.logger($, message) : console.log(message);
            }
        });
    }
}

// Értesítés a BEADÓ rádióamatőrnek, hogy a beadványához QSL-igazolás(oka)t
// kell feltöltenie (a diploma QSL-mintavételezése kisorsolt rá néhány QSO-t,
// lásd drawQslSample, controllers/submissions.js) — enélkül a beadvány
// `awaiting_qsl` állapotban ragadna, a bírálat el sem indulhat. Felhasználói
// kérésre (2026-09-18): könnyen előfordulhat, hogy ezt valaki nem veszi
// észre a beadás utáni átirányításon (a beadvány oldalán ugyan látszik, de
// nincs rá külön figyelemfelhívás) — KIZÁRÓLAG az upload_submission hívja,
// közvetlenül a beadás pillanatában, amikor a `status` `awaiting_qsl`-re áll
// (lásd ott). Az `applicant`-et a hívó már úgyis lekérdezte (email/name/
// language a rule-engine kiértékeléshez), nem duplikáljuk a lekérdezést.
async function notifyApplicantQslNeeded($, submission, diploma, applicant) {
    let language = applicant.language || 'hu';
    let qslCount = Array.isArray(submission.qslRequests) ? submission.qslRequests.length : 0;

    MAIL(applicant.email, RESOURCE(language, 'email.submission.qsl_needed.subject'), 'submissions/email-decision', {
        greeting: RESOURCE(language, 'email.greeting'),
        name: formatName(language, applicant.firstName, applicant.lastName),
        intro: RESOURCE(language, 'email.submission.qsl_needed.intro').replace('{0}', diploma.name).replace('{1}', String(qslCount)),
        remark: null,
        remark_label: RESOURCE(language, 'submissions.detail.review.remark'),
        btn_label: RESOURCE(language, 'email.submission.qsl_needed.btn'),
        submission_link: FUNC.emailLink(`/submissions/${submission._id}`),
        footer: RESOURCE(language, 'email.footer')
    }, language, function (err) {
        if (err) FUNC.logger($, `Email ERROR (QSL needed): ${applicant.email} -> ${err}`);
    });
}

// Ugyanaz, mint schemas/users/users.js formatName()-je (szándékosan külön
// másolat — lásd a fájl tetején lévő indoklást a séma-file-ok önállóságáról).
function formatName(lang, firstName, lastName) {
    return lang === 'hu' ? `${lastName} ${firstName}` : `${firstName} ${lastName}`;
}

// A CERT_RENDERER.renderPdf() overlayFields-jéhez tartozó `fieldValues` map
// összeállítása egy JÓVÁHAGYOTT beadványból (lásd schemas/diplomas/diplomas.js
// OVERLAY_KEYS — csak a diplomán ténylegesen bekapcsolt mezők jelennek meg a
// végleges PDF-en, a renderer maga hagyja ki a hiányzó/üres kulcsokat). A
// `points`/`categoryLabel`/`tierLabel`/`zoneLabel` csak `ruleMode:'points'`
// diplománál értelmezett (checklist módban a submission.autoCheckDetails.mode
// 'checklist', ott nincs pontszám-fogalom) — a kategória/fokozat-adatok a
// FELTÖLTÉSKOR (automatikus pontok alapján) számolt autoCheckDetails.categories
// tömbből jönnek: ha a manager utólag kézi korrekcióval módosította a
// pontszámot, ez a bontás NEM számolódik újra kategóriánként (a `points` mező
// viszont a VÉGLEGES, korrigált `submission.totalPoints`-ot mutatja) — ha egy
// kézi korrekció ténylegesen átbillentene egy fokozat-határt, ez egy ismert,
// vállalt korlát, nem hiba. Több, egyszerre elért kategória esetén a
// legmagasabb pontszámú (categoryPoints) kategória kerül a bizonyítványra.
function buildCertificateFieldValues(diploma, submission, applicant, language, serialNumber) {
    let values = {
        callsign: applicant.callsign || '',
        applicantName: formatName(language, applicant.firstName, applicant.lastName),
        serialNumber: String(serialNumber),
        diplomaName: diploma.name,
        issueDate: new Date().toLocaleDateString(language)
    };

    let details = submission.autoCheckDetails;

    if (details && details.mode === 'points') {
        values.points = String(submission.totalPoints);

        if (details.zone)
            values.zoneLabel = RESOURCE(language, `diplomas.zone.${details.zone}`);

        if (Array.isArray(details.categories)) {
            let achieved = details.categories.filter(c => c.achievedTier).sort((a, b) => b.points - a.points);

            if (achieved.length) {
                values.categoryLabel = achieved[0].label;
                values.tierLabel = achieved[0].achievedTier.label;
            }
        }
    }

    return values;
}

// Atomi sorszám-kiosztás + a végleges (vízjel NÉLKÜLI) PDF oklevél
// legenerálása és tárolása — KIZÁRÓLAG a `decide` action 'approve' ágából
// hívva, a döntést rögzítő DB-írás ELŐTT (lásd ott a kommentet, miért ebben a
// sorrendben). A diploma `serialCounter`-e a `serialStart`-tal indul, és minden
// jóváhagyásnál ELŐSZÖR a JELENLEGI értéket osztjuk ki (a `findOneAndUpdate`
// `returnDocument:'before'` a NÖVELÉS ELŐTTI dokumentumot adja vissza), utána
// nő eggyel a következő jóváhagyásnak — így egy `serialStart:1` diploma első
// ténylegesen kiadott oklevele az #1 sorszámot kapja, nem a #2-t.
async function issueCertificate($, submission, diploma, applicant) {
    if (!diploma || !diploma.blankImage || !diploma.blankImage.key || !(await STORAGE.exists(diploma.blankImage.key)))
        return { error: RESOURCE($.language, 'error.internal') };

    let serialDoc = await MDB.findOneAndUpdate(process.env.MONGODB_DB_NAME, 'diplomas', { _id: diploma._id }, { $inc: { serialCounter: 1 } }, {
        returnDocument: 'before',
        projection: { serialCounter: 1 }
    });

    if (isDbError(serialDoc) || !serialDoc)
        return { error: RESOURCE($.language, 'error.internal') };

    let serialNumber = serialDoc.serialCounter;
    let language = applicant.language || 'hu';
    let overlayFields = Array.isArray(diploma.overlayFields) ? diploma.overlayFields : [];
    let fieldValues = buildCertificateFieldValues(diploma, submission, applicant, language, serialNumber);

    let pdfBuffer;

    try {
        pdfBuffer = await CERT_RENDERER.renderPdf(await STORAGE.read(diploma.blankImage.key), diploma.blankImage.key, overlayFields, fieldValues, diploma.overlayFontFamily, diploma.overlayFontSize);
    } catch (e) {
        FUNC.logger($, `Submissions/Submissions decide: PDF render error (submission ${submission._id}): ${e.message}`);
        return { error: RESOURCE($.language, 'error.internal') };
    }

    let key = `submissions/${submission._id}/diploma.pdf`;
    await STORAGE.save(key, pdfBuffer);

    return {
        serialNumber: serialNumber,
        issuedPdf: { filename: `oklevel-${serialNumber}.pdf`, storage: STORAGE.driver, key: key }
    };
}

// Egy beadvány elfogadása — sorszám-kiosztás + PDF-generálás (issueCertificate)
// + a döntés rögzítése + értesítő e-mail. Ez a KÖZÖS logika a manager kézi
// jóváhagyása (lásd a 'decide' action fenti approve ága) ÉS az automatikus
// elfogadás (diploma.autoApprove, lásd controllers/submissions.js
// upload_submission — onnan a lent globálisan exportált
// SUBMISSIONS_APPROVAL.approve-on keresztül hívva) között — `reviewerId` a
// kézi esetben a jóváhagyó manager _id-ja, automatikus elfogadásnál `null`
// (senki nem bírálta el emberileg, ez auditálható nyom, lásd a submission
// `reviewedBy` mezőjét). `$` a hívó kontextusa — sémaakciónál a szokásos `$`,
// a controllerből hívva a controller `self`-je (mindkettőn van `.language`,
// és a belső `FUNC.logger($, ...)`/`RESOURCE($.language, ...)` hívások
// mindkettővel működnek, lásd notifyPaymentConfirmed hasonló, `$` nélkül is
// hívható mintáját lentebb).
async function approveSubmission($, submission, diploma, applicant, reviewerId, remark) {
    let certificate = await issueCertificate($, submission, diploma, applicant);

    if (certificate.error)
        return { error: certificate.error };

    let status = 'approved';
    let update = {
        status: status,
        managerRemark: remark || null,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        serialNumber: certificate.serialNumber,
        issuedPdf: certificate.issuedPdf,
        updated: new Date()
    };

    // Ha a kiválasztott kézbesítési módért (PDF-fee, ill. fizikai esetén
    // PDF-fee + felár, lásd modules/payment-pricing.js) a diploma díjat kér,
    // a beadvány NEM 'approved'-ként áll meg, hanem egyből 'awaiting_payment'-
    // re vált — a PDF már EKKOR legenerálódik/tárolódik, de a LETÖLTÉSE a
    // `serve_diploma_pdf` controller-actionben zárolva van, amíg a
    // `pricing.pdfFee` konkrétan ki nincs fizetve (lásd ott
    // `pdfDownloadAllowed`). Automatikus elfogadásnál (autoApprove) ez a
    // diploma-mentés validációja miatt gyakorlatilag mindig 0 (fizikai
    // kézbesítés autoApprove-nál tiltott, PDF-díj viszont technikailag
    // engedélyezett marad — ha valaki mégis beállítana rá PDF-díjat, ugyanígy
    // 'awaiting_payment'-re vált, NEM 'approved'-ra, tehát az "azonnal
    // megkapja" ígéret erre az esetre nem teljesül maradéktalanul, ez
    // szándékos és konzisztens a kézi jóváhagyás viselkedésével).
    let amount = PAYMENT_PRICING.calculateFee(diploma, submission.deliveryChoice);

    if (amount > 0) {
        status = 'awaiting_payment';
        update.status = 'awaiting_payment';
    }

    let dbUpdate = await MDB.updateOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID(submission._id) }, update);

    if (isDbError(dbUpdate))
        return { error: RESOURCE($.language, 'error.internal') };

    await notifyDecision($, submission, status, remark, applicant);

    return { status: status, serialNumber: update.serialNumber };
}

async function rejectSubmission($, submission, remark, applicant, reviewerId) {
    let update = {
        status: 'rejected',
        managerRemark: remark || null,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        updated: new Date()
    };

    let dbUpdate = await MDB.updateOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID(submission._id) }, update);

    if (isDbError(dbUpdate))
        return { error: RESOURCE($.language, 'error.internal') };

    await notifyDecision($, submission, 'rejected', remark, applicant);

    return { status: 'rejected' };
}

// A controller (controllers/submissions.js upload_submission, upload_qsl)
// INNEN, nem séma-route-on keresztül hívja az automatikus elfogadást ill. a
// manager-értesítést — a sémafájlok (schemas/) module-scope függvényei
// alapból nem érhetők el máshonnan, ezért itt, a fájl betöltésekor
// (NEWSCHEMA-n kívül, de ugyanabban a closure-ban) tesszük globálisan
// elérhetővé, a projekt modules/-beli globális namespace-eihez (ADIF_PARSER,
// RULE_ENGINE, CERT_RENDERER stb.) hasonló mintával.
global.SUBMISSIONS_APPROVAL = { approve: approveSubmission, notifyReviewNeeded: notifyManagerReviewNeeded, notifyQslNeeded: notifyApplicantQslNeeded };

// A submission tényleges totalPoints-ját számolja újra a NYERS autoPoints
// (qsoBreakdown, a rule-engine már a "globális maximum" logikával számolta ki
// QSO-nként, lásd modules/rule-engine.js) és a manualAdjustments alapján —
// MINDIG a teljes listából, nem inkrementálisan, hogy a globális-maximum
// filozófia konzisztens maradjon a kézi korrekciókkal is: egy QSO-hoz kötött,
// SZABÁLY-alapú kézi korrekció (`ruleBased:true`, lásd adjustPoints action)
// egy MÁSIK, a rendszer által esetleg csak emberi megerősítéssel felismert
// illeszkedő szabályt jelent — ez NEM adódik hozzá az automatikusan talált
// legjobb szabály pontjához, hanem ugyanúgy versenyez vele: a kettő közül a
// MAGASABB pontú számít (felhasználói visszajelzés: "nem +3 pontot kap, hanem
// módosul 3-ra"). Egy EGYÉNI (nem szabály-alapú) kézi korrekció viszont
// valódi, a szabályrendszertől független jóváírás/levonás — az TOVÁBBRA IS
// hozzáadódik (akár QSO-hoz kötött, akár nem — a nem QSO-hoz kötött
// korrekciók pedig, mivel nincs mihez "versenyezniük", mindig összeadódnak).
function computeTotalPoints(qsoBreakdown, manualAdjustments) {
    let qsoAutoPoints = {};

    if (Array.isArray(qsoBreakdown)) {
        for (let i = 0, n = qsoBreakdown.length; i < n; i++) {
            qsoAutoPoints[String(qsoBreakdown[i].qsoRef)] = qsoBreakdown[i].autoPoints;
        }
    }

    let byQso = {};
    let generalSum = 0;

    for (let i = 0, n = manualAdjustments.length; i < n; i++) {
        let a = manualAdjustments[i];

        if (a.qsoRef == null) {
            generalSum += a.amount;
            continue;
        }

        let key = String(a.qsoRef);

        if (!byQso[key])
            byQso[key] = { bestRulePoints: null, customSum: 0 };

        if (a.ruleBased) {
            if (byQso[key].bestRulePoints == null || a.amount > byQso[key].bestRulePoints)
                byQso[key].bestRulePoints = a.amount;
        } else {
            byQso[key].customSum += a.amount;
        }
    }

    let total = generalSum;

    for (let key in qsoAutoPoints) {
        let auto = qsoAutoPoints[key];
        let bucket = byQso[key];

        if (bucket) {
            let effective = bucket.bestRulePoints == null ? auto : Math.max(auto, bucket.bestRulePoints);
            total += effective + bucket.customSum;
            delete byQso[key];
        } else {
            total += auto;
        }
    }

    // Védőháló: ha egy manualAdjustments qsoRef véletlenül nem szerepel a
    // qsoBreakdown-ban (nem fordulhatna elő — az adjustPoints action
    // létrehozáskor ellenőrzi a qsoRef létezését), a hozzá tartozó pontokat ne
    // veszítsük el.
    for (let key in byQso) {
        total += (byQso[key].bestRulePoints || 0) + byQso[key].customSum;
    }

    return total;
}
