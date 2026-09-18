// payments.js — Stripe/PayPal webhooks + payment return/cancel pages
// (step 10). These routes are INTENTIONALLY not marked with `+`
// (they don't require login) — external providers (Stripe/PayPal servers)
// call them, they have no Total.js session cookie. Actually STARTING a
// payment (creating a Checkout Session / Order) depends on the logged-in
// user, so THAT lives in schemas/submissions/submissions.js's `pay` action,
// not here.
//
// In the local dev environment (docker, no public URL) Stripe/PayPal's
// servers CANNOT reach the webhook routes — so the return pages
// (stripe_return/paypal_return) ALSO check/record the payment synchronously
// themselves (not just waiting on the webhook), so the dev/test flow works
// through without a webhook too. The webhook is the "source of truth" in
// production (more reliable, because it arrives even if the user doesn't
// return to our page) — both paths lead to the SAME idempotent
// markSubmissionPaid().

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

// Idempotent: if the submission is already 'paid'/'completed', does nothing
// (a webhook AND the return page can both fire for the same payment, or the
// provider may resend the webhook multiple times as a delivery guarantee).
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

// Intentionally a separate copy of schemas/submissions/submissions.js's
// notifyPaymentConfirmed() — see the reasoning at the top of the
// submissions.js file about the schema/controller layer's independence
// (there's no cross-require between the two layers' files in this codebase).
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

// Here `self.body` is the RAW (Buffer) body, because the route is registered
// with the ['raw'] flag (see exports.install) — Stripe's signature
// verification (`STRIPE.webhooks.constructEvent`) needs exactly this, since a
// previously JSON.parse()'d/re-serialized body would produce a DIFFERENT byte
// sequence, and the signature check would falsely fail.
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

// PayPal does NOT verify the webhook signature locally (HMAC), but via a
// callback (see modules/paypal-client.js) — so here the ['raw'] flag is NOT
// needed, the normal JSON body-parse is enough (we don't need the raw bytes).
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

// Target of the Stripe Checkout `success_url` — using the `session_id` query
// parameter, we also query the Checkout Session's actual status
// synchronously (so we don't just wait for the webhook, see the reasoning at
// the top of the file). Afterwards it ALWAYS redirects back to the
// submission's page, regardless of whether it succeeded.
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

// Target of the PayPal Checkout `return_url` — PayPal returns the approved
// order's identifier in the `token` query parameter. Here we ACTUALLY call
// the capture (the `pay` action only CREATED the order; after approval, the
// charge has to be performed by the return page/webhook).
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
