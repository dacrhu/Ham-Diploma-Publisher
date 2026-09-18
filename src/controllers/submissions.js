// submissions.js — a rádióamatőr napló-beadási folyamata: napló feltöltése egy
// diplomához, automatikus kiértékelés (modules/rule-engine.js), a beadvány
// állapotának meghatározása, majd a saját beadványok listázása/megtekintése.
// A tényleges létrehozás (upload_submission) egy sima multipart form
// POST-ra épül (nincs saját frontend JS, ugyanaz a
// szemlélet, mint a controllers/diplomas-public.js egészénél) — a fájl-
// feltöltés maga a diplomas-admin.js upload_blank mintáját követi (a
// `self.files`/`self.body` Total.js multipart mezők, ['upload'] route-flag).
const Fs = require('fs');

// Ezekben az állapotokban NEM engedünk új beadványt ugyanahhoz a diplomához —
// csak explicit elutasítás (automatikus vagy manager általi) után adhat be
// újra a rádióamatőr. Lásd findBlockingSubmission().
const NON_BLOCKING_STATUSES = ['rejected_auto', 'rejected'];

// Állapot -> Bulma tag szín (a submissions.status.* resource kulcsok
// megjelenítéséhez a list/detail view-kban). A 8-9. lépés (manager review, PDF)
// további státusz-átmeneteket fog hozzáadni, ez a lista már most tartalmazza a
// teljes STATUSES enumerációt (schemas/submissions/submissions.js korábbi
// STATUSES konstansa, itt csak a megjelenítéshez kell).
const STATUS_CSS = {
    submitted: 'is-light',
    rejected_auto: 'is-danger',
    awaiting_qsl: 'is-warning',
    pending_review: 'is-info',
    approved: 'is-success',
    rejected: 'is-danger',
    awaiting_payment: 'is-warning',
    paid: 'is-success',
    completed: 'is-success'
};

exports.install = function () {
    ROUTE('GET /submissions', view_list);
    ROUTE('GET /submissions/new/{diplomaId}', view_new);
    ROUTE('GET /submissions/{id}', view_detail);
    ROUTE('+POST /upload/submissions/{diplomaId}', upload_submission, ['upload'], Number(process.env.UPLOAD_MAX_FILE_SIZE_IN_KB));
    // QSL-igazolás feltöltése (7. lépés) — egy kép/scan a sorsolt QSO-nkénti
    // igazoláshoz. A `qsoRef` a submissions.qsoBreakdown/qslRequests tömbindexe
    // (lásd modules/rule-engine.js), NEM egy önálló Mongo _id.
    ROUTE('+POST /upload/submissions/{id}/qsl/{qsoRef}', upload_qsl, ['upload'], Number(process.env.UPLOAD_MAX_FILE_SIZE_IN_KB));
    ROUTE('GET /uploads/submissions/{id}/qsl/{qsoRef}', serve_qsl);
    // A jóváhagyáskor (9. lépés) legenerált végleges PDF oklevél letöltése —
    // ugyanaz a hozzáférés-szabály, mint a beadvány megtekintéséhez.
    ROUTE('GET /uploads/submissions/{id}/diploma', serve_diploma_pdf);
    ROUTE('+GET /api/submissions *Submissions/Submissions --> query');
    ROUTE('+GET /api/submissions/{id} *Submissions/Submissions --> get');

    // Manager review (8. lépés) — a beadvány megtekintése ugyanazon a
    // /submissions/{id} oldalon történik (view_detail, isReviewer flag), csak
    // a várólista-oldal (`/admin/submissions`) és a döntés/pontkorrekció
    // JSON-API-i önállóak.
    ROUTE('GET /admin/submissions', view_review_list);
    ROUTE('+GET /api/admin/submissions *Submissions/Submissions --> reviewQueue');
    ROUTE('+POST /api/submissions/{id}/points *Submissions/Submissions --> adjustPoints');
    ROUTE('+POST /api/submissions/{id}/decide *Submissions/Submissions --> decide');

    // Fizetés (10. lépés) — a tényleges Stripe/PayPal-webhookok és a
    // fizetés-visszatérési (return) oldalak külön controllerben vannak
    // (controllers/payments.js), mert azok NEM $.user-hez kötött, külső
    // hívások — ez a három action itt mind a bejelentkezett felhasználóhoz
    // kötött (a beadvány tulajdonosa indítja a fizetést, a manager hagyja
    // jóvá/zárja le).
    ROUTE('+POST /api/submissions/{id}/pay *Submissions/Submissions --> pay');
    ROUTE('+POST /api/submissions/{id}/pay/bank-confirm *Submissions/Submissions --> confirmBankTransfer');
    ROUTE('+POST /api/submissions/{id}/complete *Submissions/Submissions --> markCompleted');
};

// Ugyanaz, mint controllers/diplomas-admin.js isManager()-je (szándékosan
// külön másolat, lásd az ottani mintát).
function isManager(self) {
    return !!(self.user && (self.user.sa || self.user.permissions.indexOf('manager') !== -1));
}

async function view_list() {
    let self = this;

    if (!self.user) {
        self.redirect('/login');
        return;
    }

    let result = await MDB.find(process.env.MONGODB_DB_NAME, 'submissions', { userId: self.user._id }, {
        projection: { qsoBreakdown: 0, autoCheckDetails: 0 }
    }, { created: -1 });

    if (isDbError(result))
        result = [];

    await attachDiplomaInfo(result);

    self.repository.submissions = result.map(s => decorateSubmission(s, self.language));
    self.view('list');
}

async function view_new(diplomaId) {
    let self = this;

    if (!self.user) {
        self.redirect('/login');
        return;
    }

    let diploma = await loadSubmittableDiploma(diplomaId);

    if (!diploma) {
        self.redirect('/diplomas');
        return;
    }

    let blocking = await findBlockingSubmission(diplomaId, self.user._id);

    if (blocking) {
        self.redirect('/submissions/' + blocking._id);
        return;
    }

    self.repository.diploma = diploma;
    // Query-string alapú hibavisszajelzés (lásd upload_submission redirect-jeit)
    // — nincs saját JS/flash mechanizmus ezen az oldalon, ugyanaz a minta, mint
    // a diplomas-public.js egészénél. Az 'internal' kód a MÁR LÉTEZŐ, általános
    // error.internal kulcsot használja (nincs értelme duplikálni). A RESOURCE()
    // hívás itt, a controllerben történik (nem a view-ban) — ugyanaz a minta,
    // mint a diplomas-public.js összes @(#...) paraméteres szövegénél.
    self.repository.errorMessage = self.query.error
        ? RESOURCE(self.language, self.query.error === 'internal' ? 'error.internal' : 'error.submission.' + self.query.error)
        : null;
    self.view('new');
}

async function view_detail(id) {
    let self = this;

    if (!self.user) {
        self.redirect('/login');
        return;
    }

    let submission;

    try {
        submission = await MDB.findOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID(id) });
    } catch (e) {
        self.throw404();
        return;
    }

    if (isDbError(submission) || !submission) {
        self.throw404();
        return;
    }

    if (!(await canAccessSubmission(self.user, submission))) {
        self.throw403();
        return;
    }

    await attachDiplomaInfo([submission]);

    self.repository.isOwner = submission.userId === self.user._id;
    // canAccessSubmission fent már csak három esetben engedett át: tulajdonos,
    // sa, vagy a diploma hozzárendelt managere — tehát ha NEM a tulajdonos
    // jutott idáig, csak sa/manager lehet, azaz reviewer. A tulajdonos SOSE
    // reviewer, MÉG AKKOR SEM, ha egyébként sa/manager (pl. a manager a saját
    // hívójelével adott be egy naplót saját magának) — a saját beadványát
    // senki nem bírálhatja el saját maga, ez a felhasználói visszajelzés nyomán
    // bevezetett szabály (lásd Submissions/Submissions adjustPoints/decide
    // action ugyanezen, szerveroldali kikényszerítését is). KIVÉTEL: `DEBUG`
    // módban (Total.js global, csak fejlesztői környezetben igaz) a
    // tulajdonos IS reviewernek számít, ha egyébként sa/a diploma managere —
    // felhasználói kérésre, hogy egyetlen teszt-manager-fiókkal is ki lehessen
    // próbálni a teljes elbírálási folyamatot anélkül, hogy második fiókot
    // kelljen létrehozni. ÉLES (nem-DEBUG) környezetben ez a kivétel sose fut.
    let isReviewer = !self.repository.isOwner;
    let diploma = null;

    if (self.repository.isOwner && DEBUG) {
        diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) }, { projection: { matchRules: 1, type: 1, managerId: 1 } });
        isReviewer = self.user.sa || !!(diploma && diploma.managerId === self.user._id);
    }

    self.repository.isReviewer = isReviewer;

    // A diploma tényleges szabálylistája (matchRules) csak a reviewernek kell,
    // és csak amíg ténylegesen van mit elbírálni — a soronkénti kézi korrekció
    // (lásd views/submissions/detail.html "Elbírálás" panelje) innen kínálja fel
    // választható szabályként (a pontérték a szabályból jön, nem a kliensből —
    // lásd Submissions/Submissions adjustPoints action).
    self.repository.diplomaRuleOptions = [];

    if (self.repository.isReviewer && submission.status === 'pending_review') {
        if (!diploma) {
            diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) }, { projection: { matchRules: 1, type: 1 } });
        }
        self.repository.diplomaRuleOptions = buildRuleOptions(diploma, self.language);
    }

    // Ki alkalmazta az egyes kézi korrekciókat — fontos, hogy ez MINDIG
    // látsszon (nem csak a beadvány elbírálásának pillanatában aktuális
    // managernek), mert egy diploma felelőse idővel változhat, és a
    // korrekciós történetből utólag, a managerId puszta ismerete nélkül nem
    // derülne ki, ki volt a tényleges döntéshozó (felhasználói kérés).
    let managerInfoByUserId = await resolveManagerInfo(submission.manualAdjustments);

    self.repository.submission = decorateSubmission(submission, self.language, managerInfoByUserId);
    // Query-string alapú hibavisszajelzés a QSL-kép-feltöltő űrlaphoz (lásd
    // upload_qsl redirect-jeit) — ugyanaz a minta, mint view_new-nál.
    self.repository.errorMessage = self.query.error
        ? RESOURCE(self.language, self.query.error === 'internal' ? 'error.internal' : 'error.submission.' + self.query.error)
        : null;
    // Stripe/PayPal cancel_url ide irányít vissza `?payment=cancelled`-lel —
    // nincs hozzá állapotváltozás, csak egy tájékoztató üzenet.
    self.repository.paymentCancelledMessage = self.query.payment === 'cancelled'
        ? RESOURCE(self.language, 'submissions.detail.payment.cancelled')
        : null;

    // Fizetési infó (10. lépés) — csak azoknál az állapotoknál kell, ahol
    // ténylegesen releváns (fizetésre vár / már fizetve / lezárva). A
    // `pdfDownloadAllowed` a serve_diploma_pdf-fel AZONOS logikát tükrözi
    // (lásd ott) — ha a diploma pdfFee-t kér, a letöltés gomb a view-ban
    // csak akkor jelenik meg, ha ez `true`.
    self.repository.pdfDownloadAllowed = true;
    self.repository.paymentInfo = null;

    if (['awaiting_payment', 'paid', 'completed'].indexOf(submission.status) !== -1) {
        let pricingDiploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) }, {
            projection: { pricing: 1, paymentMethods: 1, bankTransferDetails: 1 }
        });

        if (!isDbError(pricingDiploma) && pricingDiploma) {
            let pdfFee = (pricingDiploma.pricing && pricingDiploma.pricing.pdfFee) || 0;
            self.repository.pdfDownloadAllowed = pdfFee <= 0 || submission.status !== 'awaiting_payment';

            if (submission.status === 'awaiting_payment') {
                self.repository.paymentInfo = {
                    amount: PAYMENT_PRICING.calculateFee(pricingDiploma, submission.deliveryChoice),
                    currency: pricingDiploma.pricing.currency,
                    methods: pricingDiploma.paymentMethods || [],
                    bankTransferDetails: pricingDiploma.bankTransferDetails
                };
            }
        }
    }

    self.view('detail');
}

// A diploma matchRules-jét alakítja a soronkénti kézi korrekció <select>-jének
// kész (index+szöveg+pont) opciólistájává — csak `standard` típusú diplománál
// értelmezett (a `challenge` típus nem matchRules-alapú, lásd
// schemas/diplomas/diplomas.js DIPLOMA_TYPES kommentjét). A leírószöveg a
// describeMatchedRule()-t hívja (lásd lent), UGYANAZT a lokalizált sablont
// használva, mint amit egy automatikusan illeszkedő szabálynál a QSO-táblázat
// megjelenít — a `label` mező neve a diploma-sémában `label`, a
// describeMatchedRule viszont `ruleLabel`-t vár, innen a mezőnév-átnevezés.
function buildRuleOptions(diploma, language) {
    if (!diploma || (diploma.type || 'standard') !== 'standard' || !Array.isArray(diploma.matchRules))
        return [];

    return diploma.matchRules.map((rule, index) => {
        let described = describeMatchedRule({ field: rule.field, operator: rule.operator, value: rule.value, points: rule.points, ruleLabel: rule.label || null }, language);
        return { index: index, text: described.text, points: rule.points };
    });
}

// Manager review-sor (8. lépés) — server-oldalon renderelt, MDB+decorateSubmission
// közvetlenül (nincs JS/fetch, ugyanaz a minta, mint a fenti view_list-nél —
// NEM a Submissions/Submissions reviewQueue API actionön keresztül megy, az
// a séma saját API-felületének teljességéhez van, lásd a query/get actionök
// hasonló, jelenleg frontend JS által nem használt szerepét).
async function view_review_list() {
    let self = this;

    if (!isManager(self)) {
        self.redirect('/');
        return;
    }

    let query = {};

    if (!self.user.sa) {
        let diplomaIds = await managedDiplomaIds(self.user._id);

        if (!diplomaIds.length) {
            self.repository.submissions = [];
            self.repository.statusFilter = self.query.status || 'pending_review';
            self.view('review-list');
            return;
        }

        query.diplomaId = { $in: diplomaIds };
    }

    let statusFilter = self.query.status || 'pending_review';

    if (statusFilter !== 'all')
        query.status = statusFilter;

    let result = await MDB.find(process.env.MONGODB_DB_NAME, 'submissions', query, {
        projection: { qsoBreakdown: 0, autoCheckDetails: 0 }
    }, { created: -1 });

    if (isDbError(result))
        result = [];

    await attachDiplomaInfo(result);
    await attachApplicantInfo(result);

    self.repository.submissions = result.map(s => decorateSubmission(s, self.language));
    self.repository.statusFilter = statusFilter;
    self.view('review-list');
}

async function upload_submission(diplomaId) {
    let self = this;

    if (!self.user) {
        self.throw401();
        return;
    }

    let diploma = await loadSubmittableDiploma(diplomaId);

    if (!diploma) {
        self.redirect('/diplomas');
        return;
    }

    let blocking = await findBlockingSubmission(diplomaId, self.user._id);

    if (blocking) {
        self.redirect('/submissions/' + blocking._id);
        return;
    }

    if (!self.files || !self.files.length) {
        self.redirect('/submissions/new/' + diplomaId + '?error=file.required');
        return;
    }

    let file = self.files[0];
    let text;

    try {
        text = Fs.readFileSync(file.path, 'utf8');
    } catch (e) {
        self.redirect('/submissions/new/' + diplomaId + '?error=file.required');
        return;
    }

    let qsos = ADIF_PARSER.parse(text);

    if (!qsos.length) {
        self.redirect('/submissions/new/' + diplomaId + '?error=file.empty');
        return;
    }

    // A kézbesítési mód (PDF-only / fizikai is) csak akkor fogadható el
    // "physical"-ként, ha a diploma ténylegesen kínálja — a kliens-oldali
    // választást itt, szerveroldalon is újra ellenőrizzük, nem bízunk a form
    // mezőben (közvetlen POST is érkezhet a view_new megkerülésével).
    let deliveryChoice = (self.body && self.body.deliveryChoice === 'physical' && diploma.physicalOfferEnabled) ? 'physical' : 'pdf';

    // A projekció a rule-engine-nek (country) ÉS az esetleges automatikus
    // elfogadásnak (diploma.autoApprove, lásd lent) is elég adatot ad, hogy ne
    // kelljen külön lekérdezést indítani a happy path-en.
    let applicant = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(self.user._id) }, {
        projection: { country: 1, email: 1, firstName: 1, lastName: 1, language: 1, callsign: 1 }
    });

    if (isDbError(applicant) || !applicant) {
        self.redirect('/submissions/new/' + diplomaId + '?error=internal');
        return;
    }

    let evaluation;

    try {
        evaluation = RULE_ENGINE.evaluate(diploma, qsos, applicant.country);
    } catch (e) {
        FUNC.logger(self, `Submissions upload: rule-engine error (diploma ${diplomaId}): ${e.message}`);
        self.redirect('/submissions/new/' + diplomaId + '?error=internal');
        return;
    }

    let submissionId = MDB.ObjectID();
    let ext = (file.filename.split('.').pop() || 'adi').toLowerCase().replace(/[^a-z0-9]/g, '') || 'adi';
    let key = `submissions/${submissionId}/log.${ext}`;

    await STORAGE.save(key, Fs.readFileSync(file.path));

    // Státusz-döntés: eligibleAuto=false -> automatikus, végleges elutasítás
    // (nincs manager-teendő). eligibleAuto=true -> vagy QSL-mintavételezésre
    // vár (a diploma ténylegesen igénylő QSL-t, lásd qslSampleCount), vagy
    // egyenesen a manager-review sorba kerül (8. lépés, ha a diplománál nincs
    // QSL-mintavételezés beállítva).
    let qslRequests = evaluation.eligibleAuto ? drawQslSample(evaluation.qsoBreakdown, diploma.qslSampleCount) : [];
    let status = !evaluation.eligibleAuto
        ? 'rejected_auto'
        : (qslRequests.length > 0 ? 'awaiting_qsl' : 'pending_review');

    let doc = {
        _id: submissionId,
        diplomaId: String(diploma._id),
        userId: self.user._id,
        serialNumber: null,
        logFile: { filename: file.filename, storage: STORAGE.driver, key: key },
        parsedQsoCount: qsos.length,
        matchedQsoCount: evaluation.matchedQsoCount,
        qsoBreakdown: evaluation.qsoBreakdown,
        autoTotalPoints: evaluation.autoTotalPoints,
        manualAdjustments: [],
        totalPoints: evaluation.autoTotalPoints,
        eligibleAuto: evaluation.eligibleAuto,
        autoCheckDetails: evaluation.autoCheckDetails,
        deliveryChoice: deliveryChoice,
        qslRequests: qslRequests,
        status: status,
        managerRemark: null,
        reviewedBy: null,
        reviewedAt: null,
        issuedPdf: null,
        payment: null,
        created: new Date(),
        updated: new Date()
    };

    let insert = await MDB.insertOne(process.env.MONGODB_DB_NAME, 'submissions', doc);

    if (isDbError(insert) || !insert.insertedId) {
        await STORAGE.delete(key);
        self.redirect('/submissions/new/' + diplomaId + '?error=internal');
        return;
    }

    FUNC.logger(self, `Submissions upload: ${submissionId} (diploma ${diplomaId}, user ${self.user._id}) -> ${status}`);

    // Automatikus elfogadás (felhasználói kérésre): ha a diploma úgy van
    // beállítva (autoApprove, lásd schemas/diplomas/diplomas.js save
    // validációját — csak akkor menthető be, ha nincs QSL-mintavételezés és
    // nincs fizikai kézbesítés kínálva), a rule-engine által ELFOGADOTT
    // (QSL-t nem igénylő, tehát pending_review-ba került) beadvány itt,
    // AZONNAL, manager-i beavatkozás nélkül végigmegy ugyanazon a
    // jóváhagyási logikán (sorszám-kiosztás + PDF-generálás + értesítés),
    // amit a manager kézi "Elfogad" gombja is futtat (lásd
    // schemas/submissions/submissions.js approveSubmission/
    // SUBMISSIONS_APPROVAL — `reviewerId:null`, mert nem emberi döntés).
    // Hiba esetén (pl. PDF-render sikertelen) a beadvány EGYSZERŰEN
    // pending_review állapotban marad — a manager kézzel el tudja bírálni,
    // nincs elveszett/hibás állapot.
    if (status === 'pending_review') {
        if (diploma.autoApprove) {
            let result = await SUBMISSIONS_APPROVAL.approve(self, doc, diploma, applicant, null, null);

            if (result.error) {
                FUNC.logger(self, `Submissions upload: auto-approve FAILED for ${submissionId}: ${result.error}`);
            } else {
                FUNC.logger(self, `Submissions upload: auto-approved ${submissionId} -> ${result.status}${result.serialNumber ? ` (serial ${result.serialNumber})` : ''}`);
            }
        } else {
            // Nincs QSL-mintavételezés (qslRequests üres) -> a beadvány
            // egyenesen ide került, a managert MÁR a beadás pillanatában
            // értesítjük (lásd a felhasználói kérést: automata diplománál
            // nem kell értesítés, QSL-sorsolásnál csak akkor, ha az amatőr
            // mindent feltöltött - lásd upload_qsl).
            await SUBMISSIONS_APPROVAL.notifyReviewNeeded(self, doc, diploma);
        }
    } else if (status === 'awaiting_qsl') {
        // A diploma QSL-mintavételezése kisorsolt néhány QSO-t -> az amatőr
        // e nélkül nem veheti észre, hogy teendője van (felhasználói kérés,
        // 2026-09-18: könnyen elsiklik felette a beadás utáni átirányításon).
        await SUBMISSIONS_APPROVAL.notifyQslNeeded(self, doc, diploma, applicant);
    }

    self.redirect('/submissions/' + submissionId);
}

// Egy QSL-igazoló kép/scan feltöltése egy KONKRÉT sorsolt QSO-hoz (lásd
// drawQslSample lent). Csak a beadvány TULAJDONOSA töltheti fel (a manager
// majd a 8. lépésben nézi meg, nem itt szerkeszt), és csak amíg a beadvány
// ténylegesen `awaiting_qsl` állapotban van — egy már lezárt (pending_review-
// ba lépett, vagy elutasított) beadványnál ez már nem módosítható.
async function upload_qsl(id, qsoRef) {
    let self = this;

    if (!self.user) {
        self.throw401();
        return;
    }

    let submission;

    try {
        submission = await MDB.findOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID(id) });
    } catch (e) {
        self.throw404();
        return;
    }

    if (isDbError(submission) || !submission) {
        self.throw404();
        return;
    }

    if (submission.userId !== self.user._id) {
        self.throw403();
        return;
    }

    if (submission.status !== 'awaiting_qsl') {
        self.redirect('/submissions/' + id);
        return;
    }

    let qslRequests = Array.isArray(submission.qslRequests) ? submission.qslRequests : [];
    let index = qslRequests.findIndex(r => String(r.qsoRef) === String(qsoRef));

    if (index === -1) {
        self.throw404();
        return;
    }

    if (!self.files || !self.files.length) {
        self.redirect('/submissions/' + id + '?error=qsl.file.required');
        return;
    }

    let file = self.files[0];
    let ext = (file.filename.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    let key = `submissions/${id}/qsl/${qsoRef}.${ext}`;

    await STORAGE.save(key, Fs.readFileSync(file.path));

    qslRequests[index].imageFile = { filename: file.filename, storage: STORAGE.driver, key: key };

    // Ha ezzel MINDEN sorsolt QSO-hoz megvan a kép, a beadvány automatikusan
    // továbblép a manager-review sorba — ez a "blokkolja a review-ba
    // kerülést" szándékos viselkedés: amíg nincs meg mindegyik kép, a
    // beadvány `awaiting_qsl` marad.
    let allUploaded = qslRequests.every(r => r.imageFile);

    let update = await MDB.updateOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID(id) }, {
        qslRequests: qslRequests,
        status: allUploaded ? 'pending_review' : 'awaiting_qsl',
        updated: new Date()
    });

    if (isDbError(update)) {
        await STORAGE.delete(key);
        self.redirect('/submissions/' + id + '?error=internal');
        return;
    }

    FUNC.logger(self, `Submissions QSL upload: ${id} qsoRef=${qsoRef}${allUploaded ? ' (mind feltöltve -> pending_review)' : ''}`);

    // Csak MOST, hogy minden sorsolt QSL-kép megvan és a beadvány ténylegesen
    // pending_review-ba lépett, értesítjük a managert - ld. a felhasználói
    // kérést: QSL-sorsolásnál nem a beadáskor, hanem csak akkor, ha az
    // amatőr mindent feltöltött (autoApprove itt fel sem merül, a diploma
    // mentése eleve tiltja autoApprove + QSL-mintavételezés együttes
    // beállítását, lásd schemas/diplomas/diplomas.js).
    if (allUploaded) {
        let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) }, {
            projection: { managerId: 1, name: 1 }
        });

        if (!isDbError(diploma) && diploma)
            await SUBMISSIONS_APPROVAL.notifyReviewNeeded(self, submission, diploma);
    }

    self.redirect('/submissions/' + id);
}

// A feltöltött QSL-kép kiszolgálása — ugyanaz a hozzáférés-szabály, mint a
// beadvány megtekintéséhez (canAccessSubmission): tulajdonos, a diploma
// felelős managere, vagy superadmin.
async function serve_qsl(id, qsoRef) {
    let self = this;

    if (!self.user) {
        self.throw401();
        return;
    }

    let submission;

    try {
        submission = await MDB.findOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID(id) }, { projection: { userId: 1, diplomaId: 1, qslRequests: 1 } });
    } catch (e) {
        self.throw404();
        return;
    }

    if (isDbError(submission) || !submission) {
        self.throw404();
        return;
    }

    if (!(await canAccessSubmission(self.user, submission))) {
        self.throw403();
        return;
    }

    let entry = (submission.qslRequests || []).find(r => String(r.qsoRef) === String(qsoRef));

    if (!entry || !entry.imageFile || !entry.imageFile.key || !(await STORAGE.exists(entry.imageFile.key))) {
        self.throw404();
        return;
    }

    await STORAGE.serve(self, entry.imageFile.key);
}

// A jóváhagyáskor legenerált végleges PDF oklevél letöltése — ugyanaz a
// hozzáférés-szabály, mint a beadvány megtekintéséhez (canAccessSubmission).
// `self.file(path, downloadName)` második paramétere állítja be a
// `Content-Disposition` fejlécet a tárolt `filename`-mel, hogy a böngésző NE a
// nyers storage-kulcsot (`submissions/{id}/diploma.pdf`) ajánlja fel mentendő
// fájlnévként.
async function serve_diploma_pdf(id) {
    let self = this;

    if (!self.user) {
        self.throw401();
        return;
    }

    let submission;

    try {
        submission = await MDB.findOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID(id) }, { projection: { userId: 1, diplomaId: 1, issuedPdf: 1, status: 1 } });
    } catch (e) {
        self.throw404();
        return;
    }

    if (isDbError(submission) || !submission) {
        self.throw404();
        return;
    }

    if (!(await canAccessSubmission(self.user, submission))) {
        self.throw403();
        return;
    }

    // Zárolás, amíg a diploma pdfFee-t kér ÉS a beadvány még nem fizetett —
    // ugyanaz a logika, mint a view_detail-ben (repository.pdfDownloadAllowed),
    // itt KÜLÖN is kikényszerítve, mert ez a route a letöltés gomb nélkül,
    // közvetlenül URL-lel is elérhető.
    if (submission.status === 'awaiting_payment') {
        let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) }, { projection: { pricing: 1 } });
        let pdfFee = (!isDbError(diploma) && diploma && diploma.pricing && diploma.pricing.pdfFee) || 0;

        if (pdfFee > 0) {
            self.throw403();
            return;
        }
    }

    if (!submission.issuedPdf || !submission.issuedPdf.key || !(await STORAGE.exists(submission.issuedPdf.key))) {
        self.throw404();
        return;
    }

    await STORAGE.serve(self, submission.issuedPdf.key, submission.issuedPdf.filename);
}

// A diploma teljesítéséhez ténylegesen hozzájáruló (nem kizárt, legalább egy
// szabálynak megfelelő) QSO-k közül sorsol ki `count` darabot, visszaadás
// nélkül (Fisher-Yates keverés + az első `count` elem) — ha kevesebb ilyen QSO
// van, mint amennyit a diploma kérne, mindegyiket kisorsolja. `count<=0`
// esetén üres tömb (nincs QSL-mintavételezés ennél a diplománál).
function drawQslSample(qsoBreakdown, count) {
    if (!(count > 0))
        return [];

    let eligible = qsoBreakdown.filter(q => !q.excludedReason && q.matchedRules && q.matchedRules.length > 0);

    for (let i = eligible.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        let tmp = eligible[i];
        eligible[i] = eligible[j];
        eligible[j] = tmp;
    }

    return eligible.slice(0, count).map(q => ({ qsoRef: q.qsoRef, call: q.call, imageFile: null }));
}

function isDbError(result) {
    return Array.isArray(result) && result[0] != null && result[0].error != null;
}

// Csak `status:'active'`, `type:'standard'` (vagy a mező hiánya, régi
// diplomáknál — lásd schemas/diplomas/diplomas.js `diploma.type || 'standard'`
// konvenció), és (ha van) még nem járt le a határidő. `challenge` típusnál
// szándékosan `null`-t ad vissza — annak a saját (jövőbeli) jelentkezési
// folyamata van, ez az általános napló-beadás nem vonatkozik rá.
async function loadSubmittableDiploma(id) {
    let diploma;

    try {
        diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(id), status: 'active' });
    } catch (e) {
        return null;
    }

    if (isDbError(diploma) || !diploma)
        return null;

    if ((diploma.type || 'standard') !== 'standard')
        return null;

    if (diploma.deadlineType === 'deadline' && diploma.deadlineDate && new Date(diploma.deadlineDate) < new Date())
        return null;

    return diploma;
}

// Lásd a NON_BLOCKING_STATUSES kommentjét fent — bármilyen státuszú MEGLÉVŐ
// beadvány blokkol egy újat, kivéve az explicit elutasítottakat.
async function findBlockingSubmission(diplomaId, userId) {
    let submission = await MDB.findOne(process.env.MONGODB_DB_NAME, 'submissions', {
        diplomaId: diplomaId,
        userId: userId,
        status: { $nin: NON_BLOCKING_STATUSES }
    });

    return isDbError(submission) ? null : submission;
}

// Ugyanaz a szabály, mint a Submissions/Submissions séma canAccessSubmission()-je
// (schemas/submissions/submissions.js) — szándékosan külön másolat, lásd az ottani
// kommentet (a séma NEWSCHEMA-regisztrációját nem akarjuk controllerből kiváltani).
async function canAccessSubmission(user, submission) {
    if (user.sa || submission.userId === user._id)
        return true;

    let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) }, { projection: { managerId: 1 } });
    return !!(diploma && diploma.managerId && diploma.managerId === user._id);
}

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

// Ugyanaz, mint schemas/submissions/submissions.js managedDiplomaIds()-je
// (szándékosan külön másolat) — view_review_list diploma-szűréséhez.
async function managedDiplomaIds(userId) {
    let diplomas = await MDB.find(process.env.MONGODB_DB_NAME, 'diplomas', { managerId: userId }, { projection: { _id: 1 } });

    if (isDbError(diplomas))
        return [];

    return diplomas.map(d => String(d._id));
}

// Ugyanaz, mint schemas/submissions/submissions.js attachApplicantInfo()-je
// (szándékosan külön másolat) — view_review_list-nek kell, hogy a manager
// lássa, ki adta be a beadványt.
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

// A manualAdjustments bejegyzések managerId-jait oldja fel egy id -> {email,
// callsign} map-re, a QSO-táblázat/history-táblázat "ki alkalmazta" oszlopához
// (lásd decorateSubmission/describeQsoBreakdownItem). Csak view_detail hívja
// (a lista-nézetek nem jelenítik meg a korrekciós történetet).
async function resolveManagerInfo(manualAdjustments) {
    if (!Array.isArray(manualAdjustments) || !manualAdjustments.length)
        return {};

    let ids = [];
    for (let i = 0, n = manualAdjustments.length; i < n; i++) {
        let id = manualAdjustments[i].managerId;
        if (id && ids.indexOf(id) === -1)
            ids.push(id);
    }

    if (!ids.length)
        return {};

    let users = await MDB.find(process.env.MONGODB_DB_NAME, 'users', { _id: { $in: ids.map(id => MDB.ObjectID(id)) } }, {
        projection: { email: 1, callsign: 1 }
    });

    if (isDbError(users))
        return {};

    let byId = {};
    for (let i = 0, n = users.length; i < n; i++) {
        byId[String(users[i]._id)] = users[i];
    }

    return byId;
}

// A managerId-hoz tartozó megjelenítendő azonosítót adja vissza (hívójel,
// vagy ha az nincs, email) — `null`, ha a manager userId-je valamiért nem
// oldható fel (pl. időközben törölt fiók).
function managerDisplayText(managerId, managerInfoByUserId) {
    let info = managerId && managerInfoByUserId[managerId];
    return info ? (info.callsign || info.email) : null;
}

// Csoport-címkék (mode/band 'group' operátor) — szándékosan ugyanaz a szó-
// szerinti másolat, mint a controllers/diplomas-public.js GROUP_LABELS/
// BAND_GROUP_LABELS-e (lásd az ottani indoklást a describeMatchRule fölött:
// kis, önálló helperek, nem érdemes közös modulba kiszervezni).
const GROUP_LABELS = { CW: 'CW', PHONE: 'Phone', DIGITAL: 'Digital', IMAGE: 'Image' };
const BAND_GROUP_LABELS = { HF: 'HF', VHF: 'VHF', UHF: 'UHF' };

// A `submission` séma helyben tárolt mezőit (státusz, QSO-bontás, auto-check
// részletek) alakítja a view-knak kész, lokalizált szöveges formára — MINDIG
// egy MDB-ből frissen betöltött dokumentumon hívva (nem perzisztál semmit).
function decorateSubmission(submission, language, managerInfoByUserId) {
    managerInfoByUserId = managerInfoByUserId || {};

    submission.statusLabel = RESOURCE(language, 'submissions.status.' + submission.status) || submission.status;
    submission.statusClass = STATUS_CSS[submission.status] || 'is-light';
    submission.deliveryLabel = RESOURCE(language, 'submissions.delivery.' + (submission.deliveryChoice || 'pdf'));

    // Hívójel-feloldás a manualAdjustments történet-táblázatához (lásd lent) —
    // a NYERS (még nem decorate-olt) qsoBreakdown-ból, mert a decorate utáni
    // alak már nem tartalmazza közvetlenül elérhető indexeléssel a call mezőt
    // qsoRef szerint (describeQsoBreakdownItem map-eli, nem kulcsolja).
    let qsoCallByRef = {};
    if (Array.isArray(submission.qsoBreakdown)) {
        for (let i = 0, n = submission.qsoBreakdown.length; i < n; i++) {
            qsoCallByRef[String(submission.qsoBreakdown[i].qsoRef)] = submission.qsoBreakdown[i].call;
        }
    }

    // QSO-ra bontva csoportosítva (qsoRef -> tömb) — a nem QSO-specifikus
    // korrekciók (qsoRef==null) itt szándékosan kimaradnak, azok csak a lenti
    // history-táblázatban jelennek meg.
    let manualByQsoRef = {};
    if (Array.isArray(submission.manualAdjustments)) {
        for (let i = 0, n = submission.manualAdjustments.length; i < n; i++) {
            let a = submission.manualAdjustments[i];
            if (a.qsoRef == null)
                continue;
            let key = String(a.qsoRef);
            (manualByQsoRef[key] = manualByQsoRef[key] || []).push(a);
        }
    }

    if (Array.isArray(submission.qsoBreakdown))
        submission.qsoBreakdown = submission.qsoBreakdown.map(item => describeQsoBreakdownItem(item, language, manualByQsoRef[String(item.qsoRef)] || [], managerInfoByUserId));

    if (submission.autoCheckDetails)
        submission.autoCheckDetails = describeAutoCheckDetails(submission.autoCheckDetails, language);

    if (Array.isArray(submission.qslRequests)) {
        submission.qslRequests = submission.qslRequests.map(r => ({
            qsoRef: r.qsoRef,
            call: r.call,
            uploaded: !!r.imageFile,
            imageUrl: r.imageFile ? `/uploads/submissions/${submission._id}/qsl/${r.qsoRef}` : null
        }));
    }

    // A manuális pontkorrekciók (lásd Submissions/Submissions adjustPoints
    // action) története — a tulajdonosnak IS látszik (átláthatóság, ő is
    // érintett a pontszám-változásban), nem csak a managernek. A QSO-hoz kötött
    // bejegyzések a fenti qsoBreakdown-soroknál IS megjelennek (describeQsoBreakdownItem
    // manualEntries mezője) — itt a TELJES történet látszik, QSO-hívójellel
    // kiegészítve, hogy a nem-QSO-specifikus (qsoRef==null) korrekciók is
    // egy helyen legyenek nyomon követhetők.
    if (Array.isArray(submission.manualAdjustments)) {
        submission.manualAdjustments = submission.manualAdjustments.map(a => ({
            qsoRef: a.qsoRef,
            call: a.qsoRef != null ? qsoCallByRef[String(a.qsoRef)] : null,
            amount: a.amount,
            reason: a.reason,
            ruleBased: !!a.ruleBased,
            managerText: managerDisplayText(a.managerId, managerInfoByUserId),
            atText: a.at ? new Date(a.at).toLocaleString(language) : ''
        }));
    }

    submission.reviewedAtText = submission.reviewedAt ? new Date(submission.reviewedAt).toLocaleString(language) : null;

    return submission;
}

// A pontoszlop kiírásához UGYANAZT a "globális maximum" logikát alkalmazza,
// mint a séma computeTotalPoints()-ja (schemas/submissions/submissions.js,
// szándékosan külön másolat) — egy szabály-alapú (`ruleBased:true`) kézi
// korrekció NEM adódik hozzá az auto ponthoz, hanem versenyez vele (a
// magasabb számít); egy egyéni (nem szabály-alapú) korrekció viszont TOVÁBBRA
// IS hozzáadódik. Enélkül a felület "autoPoints + manualPoints" formában,
// tévesen ÖSSZEADÁSKÉNT jelenítette volna meg azt, ami valójában egy
// FELÜLÍRÁS (lásd felhasználói visszajelzés: "nem +3 pontot kap, hanem
// módosul 3-ra").
function describeQsoBreakdownItem(item, language, manualEntries, managerInfoByUserId) {
    let bestRulePoints = null;
    let customSum = 0;

    for (let i = 0, n = manualEntries.length; i < n; i++) {
        let e = manualEntries[i];

        if (e.ruleBased) {
            if (bestRulePoints == null || e.amount > bestRulePoints)
                bestRulePoints = e.amount;
        } else {
            customSum += e.amount;
        }
    }

    let effectivePoints = (bestRulePoints == null ? item.autoPoints : Math.max(item.autoPoints, bestRulePoints)) + customSum;

    return {
        qsoRef: item.qsoRef,
        call: item.call,
        qsoDateText: item.qsoDate ? new Date(item.qsoDate).toLocaleString(language) : '',
        band: item.band,
        mode: item.mode,
        // A napló nyers COMMENT mezője — a manager látja, mit írt ténylegesen
        // az operátor (pl. "YL"), enélkül csak találgatni tudná, hogy egy
        // COMMENT-alapú szabály miért nem illeszkedett automatikusan (lásd a
        // soronkénti kézi korrekció felhasználói indoklását).
        comment: item.comment,
        autoPoints: item.autoPoints,
        matchedRules: (item.matchedRules || []).map(m => describeMatchedRule(m, language)),
        excludedReasonLabel: item.excludedReason ? RESOURCE(language, 'submissions.detail.qso.excluded.' + item.excludedReason) : null,
        manualEntries: manualEntries.map(e => {
            let managerText = managerDisplayText(e.managerId, managerInfoByUserId);
            let manualLabel = RESOURCE(language, 'submissions.detail.review.manual.suffix');

            return {
                amount: e.amount,
                reason: e.reason,
                ruleBased: !!e.ruleBased,
                // A "kézi" jelzés a managerId feloldott azonosítójával egészül ki
                // (hívójel/email) — fontos, hogy a korrekciós történet utólag,
                // akár manager-váltás után is egyértelműen mutassa, KI hozta a
                // döntést (felhasználói kérés).
                manualLabel: managerText ? `${manualLabel} — ${managerText}` : manualLabel
            };
        }),
        effectivePoints: effectivePoints
    };
}

// Egy illeszkedő szabály (RULE_ENGINE.evaluate matchedRules eleme, vagy egy
// checklist checklistResults eleme) emberi nyelvű leírása — ugyanaz a minta,
// mint a controllers/diplomas-public.js describeMatchRule()-ja (manager-adott
// szabad szöveg elsőbbséget élvez, egyébként mező+feltétel sablon), kiegészítve
// az átjátszós bónusz (field:'repeater', lásd modules/rule-engine.js) külön
// szövegével.
function describeMatchedRule(matched, language) {
    if (matched.field === 'repeater')
        return { text: RESOURCE(language, 'submissions.detail.qso.repeater.bonus'), points: matched.points };

    if (matched.ruleLabel)
        return { text: matched.ruleLabel, points: matched.points };

    let fieldLabel = RESOURCE(language, 'diplomas.rule.field.' + matched.field) || matched.field;
    let valueText = Array.isArray(matched.value) ? matched.value.join(', ') : String(matched.value);

    if (matched.field === 'mode' && matched.operator === 'group')
        valueText = GROUP_LABELS[matched.value] || matched.value;

    if (matched.field === 'band' && matched.operator === 'group')
        valueText = BAND_GROUP_LABELS[matched.value] || matched.value;

    let template = RESOURCE(language, 'diplomas.rule.sentence.' + matched.operator) || '{field}: {value}';
    let text = template.replace('{field}', fieldLabel).replace('{value}', valueText);

    return { text: text, points: matched.points };
}

// A RULE_ENGINE.evaluate() autoCheckDetails-jét (lásd modules/rule-engine.js)
// alakítja a detail.html-nek kész formára. Checklist módban minden szabályhoz
// a teljesült/nem teljesült jelzés + a leírás; pontozás módban vagy a
// kategóriánkénti fokozat-bontás (tiersEnabled), vagy a sima körzet-küszöb
// (a `categories` mező hiánya dönti el, melyikről van szó — lásd
// modules/rule-engine.js evaluatePointsFlat/evaluatePointsTiers).
function describeAutoCheckDetails(details, language) {
    if (details.mode === 'checklist') {
        return {
            mode: 'checklist',
            checklistResults: (details.checklistResults || []).map(r => {
                let described = describeMatchedRule(r, language);
                return { text: described.text, satisfied: r.satisfied };
            })
        };
    }

    return {
        mode: 'points',
        zone: details.zone,
        zoneThreshold: details.zoneThreshold,
        categories: details.categories || null
    };
}
