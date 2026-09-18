// payments.js — Stripe/PayPal webhookok + fizetés-visszatérési (return/cancel)
// oldalak (10. lépés). Ezek a route-ok SZÁNDÉKOSAN nincsenek `+`-szal jelölve
// (nem igényelnek bejelentkezést) — külső szolgáltatók (Stripe/PayPal szerverei)
// hívják őket, nincs Total.js session-cookie-juk. A tényleges fizetés-INDÍTÁS
// (Checkout Session / Order létrehozása) a bejelentkezett usertől függ, ezért
// AZ a schemas/submissions/submissions.js `pay` actionjében van, nem itt.
//
// Helyi fejlesztői környezetben (docker, nincs publikus URL) a Stripe/PayPal
// szerverei NEM tudják elérni a webhook-routeokat — ezért a return-oldalak
// (stripe_return/paypal_return) MAGUK IS szinkronban ellenőrzik/rögzítik a
// fizetést (nem csak a webhookra várnak), hogy a fejlesztői/teszt-folyamat
// webhook nélkül is végigmenjen. A webhook a "forrás igazság" éles környezetben
// (megbízhatóbb, mert akkor is megérkezik, ha a felhasználó nem tér vissza az
// oldalunkra) — mindkét út UGYANAHHOZ az idempotens markSubmissionPaid()-hoz fut be.

exports.install = function () {
    ROUTE('POST /webhooks/stripe', webhook_stripe, ['raw']);
    ROUTE('POST /webhooks/paypal', webhook_paypal);
    ROUTE('GET /payments/stripe/return/{id}', stripe_return);
    ROUTE('GET /payments/paypal/return/{id}', paypal_return);
};

function isDbError(result) {
    return Array.isArray(result) && result[0] != null && result[0].error != null;
}

async function logPaymentEvent(provider, submissionId, payload) {
    await MDB.insertOne(process.env.MONGODB_DB_NAME, 'paymentevents', {
        _id: MDB.ObjectID(),
        provider: provider,
        submissionId: submissionId || null,
        payload: payload,
        receivedAt: new Date()
    });
}

// Idempotens: ha a submission már 'paid'/'completed', nem csinál semmit (egy
// webhook ÉS a return-oldal is elsülhet ugyanarra a fizetésre, vagy a
// szolgáltató a webhookot többször is újraküldheti kézbesítési garanciából).
async function markSubmissionPaid(submissionId, provider, providerRef, amount, currency) {
    let submission = await MDB.findOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID(submissionId) });

    if (isDbError(submission) || !submission)
        return false;

    if (submission.status !== 'awaiting_payment')
        return submission.status === 'paid' || submission.status === 'completed';

    let update = await MDB.updateOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: submission._id }, {
        status: 'paid',
        payment: { provider: provider, providerRef: providerRef, amount: amount, currency: currency, status: 'paid', paidAt: new Date() },
        updated: new Date()
    });

    if (isDbError(update))
        return false;

    await notifyPaymentConfirmed(submission);
    return true;
}

// Szándékosan külön másolat a schemas/submissions/submissions.js
// notifyPaymentConfirmed()-jéből — lásd a submissions.js fájl tetején lévő
// indoklást a séma/controller réteg önállóságáról (nincs cross-require a két
// réteg fájljai között ebben a kódbázisban).
async function notifyPaymentConfirmed(submission) {
    let user = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(submission.userId) }, {
        projection: { email: 1, firstName: 1, lastName: 1, language: 1 }
    });

    if (isDbError(user) || !user)
        return;

    let language = user.language || 'hu';
    let name = language === 'hu' ? `${user.lastName} ${user.firstName}` : `${user.firstName} ${user.lastName}`;

    MAIL(user.email, RESOURCE(language, 'email.payment.paid.subject'), 'submissions/email-decision', {
        greeting: RESOURCE(language, 'email.greeting'),
        name: name,
        intro: RESOURCE(language, 'email.payment.paid.intro'),
        remark: null,
        remark_label: RESOURCE(language, 'submissions.detail.review.remark'),
        btn_label: RESOURCE(language, 'email.payment.paid.btn'),
        submission_link: FUNC.emailLink(`/submissions/${submission._id}`),
        footer: RESOURCE(language, 'email.footer')
    }, language, function (err) {
        if (err) console.log(`Email ERROR (payment confirmed): ${user.email} -> ${err}`);
    });
}

// A `self.body` itt a NYERS (Buffer) törzs, mert a route ['raw'] flaggel van
// regisztrálva (lásd exports.install) — a Stripe aláírás-ellenőrzéséhez
// (`STRIPE.webhooks.constructEvent`) pontosan erre van szükség, egy
// előzetesen JSON.parse()-olt/újra-serializált body ugyanis MÁS bájtsorozatot
// adna, és az aláírás-ellenőrzés hamisan buknia.
async function webhook_stripe() {
    let self = this;

    if (!STRIPE || !process.env.STRIPE_WEBHOOK_SECRET) {
        self.throw400('stripe not configured');
        return;
    }

    let event;

    try {
        event = STRIPE.webhooks.constructEvent(self.body, self.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } catch (e) {
        FUNC.logger(self, `Stripe webhook signature error: ${e.message}`);
        self.throw400('invalid signature');
        return;
    }

    let session = event.data && event.data.object;
    let submissionId = session && session.metadata && session.metadata.submissionId;

    await logPaymentEvent('stripe', submissionId, event);

    if (event.type === 'checkout.session.completed' && session.payment_status === 'paid' && submissionId) {
        await markSubmissionPaid(submissionId, 'stripe', session.id, (session.amount_total || 0) / 100, (session.currency || '').toUpperCase());
        FUNC.logger(self, `Stripe webhook: checkout.session.completed -> submission ${submissionId}`);
    }

    self.plain('ok');
}

// A PayPal a webhook-aláírást NEM helyben (HMAC), hanem egy visszahívással
// ellenőrizteti (lásd modules/paypal-client.js) — ezért itt NEM kell ['raw']
// flag, a normál JSON body-parse elég (a nyers bájtokra nincs szükségünk).
async function webhook_paypal() {
    let self = this;

    if (!PAYPAL_CLIENT.isConfigured() || !process.env.PAYPAL_WEBHOOK_ID) {
        self.throw400('paypal not configured');
        return;
    }

    let event = self.body;
    let verified;

    try {
        verified = await PAYPAL_CLIENT.verifyWebhookSignature(self.headers, event);
    } catch (e) {
        FUNC.logger(self, `PayPal webhook verification error: ${e.message}`);
        self.throw400('verification failed');
        return;
    }

    if (!verified) {
        FUNC.logger(self, 'PayPal webhook: invalid signature');
        self.throw400('invalid signature');
        return;
    }

    let orderId = event.resource && event.resource.supplementary_data && event.resource.supplementary_data.related_ids
        ? event.resource.supplementary_data.related_ids.order_id
        : null;

    await logPaymentEvent('paypal', null, event);

    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED' && orderId) {
        let submission = await MDB.findOne(process.env.MONGODB_DB_NAME, 'submissions', { 'payment.providerRef': orderId });

        if (!isDbError(submission) && submission) {
            await markSubmissionPaid(String(submission._id), 'paypal', event.resource.id, Number(event.resource.amount.value), event.resource.amount.currency_code);
            FUNC.logger(self, `PayPal webhook: PAYMENT.CAPTURE.COMPLETED -> submission ${submission._id}`);
        }
    }

    self.plain('ok');
}

// Stripe Checkout `success_url` célja — a `session_id` query paraméterrel a
// Checkout Session tényleges státuszát szinkronban is lekérdezzük (ne csak a
// webhookra várjunk, lásd a fájl tetején lévő indoklást). Utána MINDIG a
// beadvány oldalára irányít vissza, függetlenül attól, hogy sikerült-e.
async function stripe_return(id) {
    let self = this;

    if (STRIPE && self.query.session_id) {
        try {
            let session = await STRIPE.checkout.sessions.retrieve(self.query.session_id);

            if (session.payment_status === 'paid' && String(session.metadata && session.metadata.submissionId) === String(id)) {
                await markSubmissionPaid(id, 'stripe', session.id, (session.amount_total || 0) / 100, (session.currency || '').toUpperCase());
            }
        } catch (e) {
            FUNC.logger(self, `Stripe return-page error (submission ${id}): ${e.message}`);
        }
    }

    self.redirect(`/submissions/${id}`);
}

// PayPal Checkout `return_url` célja — a PayPal a jóváhagyott rendelés
// azonosítóját a `token` query paraméterben adja vissza. Itt hívjuk meg
// TÉNYLEGESEN a capture-t (a `pay` action csak LÉTREHOZTA a rendelést, a
// jóváhagyás után a terhelést a return-oldalnak/webhooknak kell elvégeznie).
async function paypal_return(id) {
    let self = this;
    let orderId = self.query.token;

    if (PAYPAL_CLIENT.isConfigured() && orderId) {
        try {
            let capture = await PAYPAL_CLIENT.captureOrder(orderId);
            let unit = capture.purchase_units && capture.purchase_units[0];
            let captureInfo = unit && unit.payments && unit.payments.captures && unit.payments.captures[0];

            if (capture.status === 'COMPLETED' && captureInfo) {
                await markSubmissionPaid(id, 'paypal', captureInfo.id, Number(captureInfo.amount.value), captureInfo.amount.currency_code);
            }
        } catch (e) {
            FUNC.logger(self, `PayPal return-page error (submission ${id}): ${e.message}`);
        }
    }

    self.redirect(`/submissions/${id}`);
}
