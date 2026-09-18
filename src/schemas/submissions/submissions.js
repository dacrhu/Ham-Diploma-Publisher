// Submissions/Submissions — listing/viewing the radio amateur's own
// submissions. CREATION (log upload + rule-engine evaluation) does NOT go
// through this schema — because of the multipart file upload, it happens in
// a plain controller action (see controllers/submissions.js
// upload_submission), the same pattern as uploading a diploma's blank image
// (controllers/diplomas-admin.js upload_blank, not a Diplomas/Diplomas action).

NEWSCHEMA('Submissions/Submissions', function (schema) {

    // The list of the logged-in user's OWN submissions — no `permissions`
    // restriction (any logged-in user is entitled to their own), following
    // the pattern of Users/Users get/save (see schemas/users/users.js).
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

    // Superadmin-only: the submissions of an ARBITRARY user — needed for the
    // /admin/users/{id} user profile page (see schemas/users/users.js's
    // adminGet/adminList — at user request); I did NOT extend the own,
    // `$.user._id`-bound `query` action for this, so that it doesn't get even
    // a theoretical permission-bypass opportunity.
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

    // Manager review queue (step 8) — a plain manager only sees the
    // submissions of the diplomas ASSIGNED TO them (see managedDiplomaIds),
    // superadmin sees all. Default filter is `pending_review` (this is the
    // actual "queue"), no filter for `?status=all`, otherwise the given
    // specific status.
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

    // Manual point correction — only in `pending_review` status (pointless
    // for submissions awaiting QSL sampling, or already reviewed). A
    // manualAdjustments entry is added to the list (not an overwrite), and
    // totalPoints is recomputed as autoTotalPoints + the sum of ALL
    // corrections — this way the full correction history is preserved and
    // traceable. Optionally bindable to a SPECIFIC QSO (`qsoRef` — the array
    // index of qsoBreakdown, NOT a standalone Mongo id, see the comment at
    // the top of the file), so e.g. a QSO that the automatic rule matching
    // skipped can still get points (e.g. the COMMENT didn't literally contain
    // the "YL" marker, but the manager knows it's relevant). Without
    // `qsoRef`, the correction applies to the entire submission
    // (not QSO-specific, e.g. some other equity point).
    // For `ruleIndex` (optional), the point value does NOT come from the
    // client — we read it from the diploma's CURRENT
    // `matchRules[ruleIndex].points`, so that the manual correction is always
    // consistent with the actually configured rule point value (the client
    // only supplies the `reason` text, which it fills in from the localized
    // rule description precomputed by controllers/submissions.js's
    // view_detail — see its call to describeMatchedRule there).
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

            let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) }, { projection: { managerId: 1, matchRules: 1, type: 1 } });

            if (!isReviewerOf($.user, submission, diploma)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.submission.forbidden') });
                return;
            }

            // A challenge diploma has no concept of qsoBreakdown/scoring (see
            // the "=== Challenge ===" section of controllers/submissions.js)
            // — the UI never offers this control for a challenge submission,
            // but a direct API call shouldn't be able to run into a
            // meaningless correction that silently fixes nothing either.
            if (diploma && (diploma.type || 'standard') === 'challenge') {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
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

    // Approval/rejection — can only start from `pending_review` status (a
    // submission awaiting QSL cannot be reviewed, see the comment on
    // controllers/submissions.js's upload_qsl: until every QSL image is
    // present, it doesn't even get here). The decision is FINAL within this
    // step (there's no "back to pending_review" action) — PDF generation
    // (step 9) will build on the `approved` status.
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

    // Initiated by the submission's OWNER — creating a Stripe Checkout /
    // PayPal Order (from among the diploma's actually offered
    // `paymentMethods`), or for bank transfer just returning the diploma's
    // bank account details + marking `submission.payment` as "pending" (the
    // actual approval is the manager's `confirmBankTransfer` action). The
    // actual Stripe/PayPal payment confirmation happens NOT here, but in
    // controllers/payments.js's webhooks/return pages (those are external
    // calls not tied to $.user — the schema-action layer only performs the
    // INITIATION).
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
            // A human-scale, unique payment reference — the serial number has
            // already been allocated by this point (the decide action
            // allocates it TOGETHER with the PDF generation, independent of
            // the payment status, see issueCertificate() above), so we can
            // reference that instead of the raw Mongo _id.
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

    // Manager's MANUAL approval — only needed for bank transfer (the
    // Stripe/PayPal payments are automatically confirmed by the
    // webhook/return page, see controllers/payments.js), but we
    // intentionally didn't tie this to
    // `submission.payment.provider === 'bank_transfer'` either: if a
    // Stripe/PayPal webhook somehow doesn't arrive (e.g. no public URL in a
    // local development environment), the manager can still close it out
    // MANUALLY this way, after verifying the payment through another channel
    // (e.g. the Stripe/PayPal admin interface).
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

    // For physical delivery, after payment there's still printing/
    // framing/mailing left — the manager marks this "completed" once they've
    // actually sent it. Meaningless for PDF-only delivery (`paid` is already
    // the end of the process by itself — the download becomes available as
    // soon as payment happens, see serve_diploma_pdf).
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

// Visible to the owner, the diploma's responsible manager, or superadmin
// (the manager-review UI, step 8, uses this same rule for viewing).
async function canAccessSubmission(user, submission) {
    if (user.sa || submission.userId === user._id)
        return true;

    let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) }, { projection: { managerId: 1 } });
    return !!(diploma && diploma.managerId && diploma.managerId === user._id);
}

// For the reviewQueue/adjustPoints/decide actions: superadmin OR the
// diploma's assigned manager may decide/correct — the submission's OWNER is
// intentionally NOT enough here, unlike in canAccessSubmission (that allows
// viewing for the owner too, this one is the actual review). The OWNER is
// NEVER a reviewer here, EVEN IF they otherwise happen to be sa/manager
// (nobody may review their own submission — a rule introduced following user
// feedback, see the same, UI-side mirror of this in controllers/
// submissions.js's view_detail). EXCEPTION: in `DEBUG` mode (Total.js
// global, true only in the development environment) the owner IS ALSO
// considered a reviewer if they're otherwise sa/the diploma's manager — at
// user request, so that the review process can be walked through end to end
// using a single test-manager account. In PRODUCTION (non-DEBUG) this never
// runs.
function isReviewerOf(user, submission, diploma) {
    if (submission.userId === user._id && !DEBUG)
        return false;

    if (user.sa)
        return true;

    return !!(diploma && diploma.managerId && diploma.managerId === user._id);
}

// Returns the _ids of the diplomas assigned to the manager, in STRING form
// (submissions.diplomaId is also a string — see the
// `diplomaId: String(diploma._id)` save in controllers/submissions.js's
// upload_submission), for the reviewQueue action's diploma filtering.
async function managedDiplomaIds(userId) {
    let diplomas = await MDB.find(process.env.MONGODB_DB_NAME, 'diplomas', { managerId: userId }, { projection: { _id: 1 } });

    if (isDbError(diplomas))
        return [];

    return diplomas.map(d => String(d._id));
}

// Resolves the diploma's name/type for every submission, the same pattern as
// schemas/diplomas/diplomas.js's attachManagerInfo() (intentionally a
// separate copy, not a shared module — see the comment there).
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

// Resolves the submitter's callsign/email for every submission — needed by
// the reviewQueue list (so the manager knows who submitted it), pointless
// for the own "My Submissions" list (query action), which intentionally
// doesn't call it.
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

// Email notification to the submitter about the manager's decision
// (approval/rejection) — in THEIR OWN language (users.language, the value
// saved at registration), NOT the deciding manager's language (see
// schemas/users/users.js's formatName(), intentionally a separate copy
// here). Only logs an error, doesn't fail the decision itself (the same
// pattern as all of users.js's MAIL() calls). `user` is passed in by the
// caller (decide action) — otherwise `issueCertificate()` would have to pay
// for the same query too, no point duplicating it.
async function notifyDecision($, submission, status, remark, user) {
    let language = user.language || 'hu';
    // 'awaiting_payment' is a BRANCH of approval (the final status isn't
    // 'approved' only because of a fee to be paid, see the decide action) —
    // from the email wording's point of view, it's the same as 'approved'.
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

// The email about a received payment — called both by the
// `confirmBankTransfer` action and controllers/payments.js's webhook/return
// handlers (the latter run WITHOUT a `$` context, so the `$` parameter is
// optional — it's only needed for error logging, which falls back to
// `console.log` in its absence).
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

// Notification to the manager (or - if the diploma has no assigned manager -
// to all superadmins) that a submission is awaiting review. To be called
// EXCLUSIVELY when a submission moves into 'pending_review' status AT THIS
// MOMENT AND the diploma is NOT autoApprove (see the call sites:
// controllers/submissions.js's upload_submission - no QSL sampling - and
// upload_qsl - upon uploading the LAST image for QSL sampling). Never called
// for autoApprove, since there the submission immediately moves on too,
// there's no state awaiting a human decision. If the diploma has no
// managerId (not yet assigned), there's no other "who's responsible for
// this" concept in the project, so ALL superadmins get notified - on error
// it only logs, nothing fails (the same pattern as the rest of the file's
// MAIL() calls).
//
// The email's LANGUAGE is intentionally the SUBMITTING radio amateur's
// (submission.userId) own language, NOT the recipient's (manager/superadmin)
// own setting - at user request (2026-09-18), because previously it went out
// in the recipient's language, and because of this, about the same
// submission, sometimes a Hungarian, sometimes an English email arrived,
// depending on which language was set on whose account. If the amateur's
// language can't be determined for some reason, the fallback is 'en' - this
// DIFFERS from the project's general 'hu' default (see 02_localization.js),
// but it's intentional here, also at user request.
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

// Notification to the SUBMITTING radio amateur that they need to upload QSL
// confirmation(s) for their submission (the diploma's QSL sampling drew some
// QSOs for it, see drawQslSample, controllers/submissions.js) — without this
// the submission would get stuck in `awaiting_qsl` status, review couldn't
// even start. At user request (2026-09-18): it can easily happen that
// someone doesn't notice this on the post-submission redirect (it is visible
// on the submission page, but there's no dedicated call-out for it) —
// called EXCLUSIVELY by upload_submission, right at the moment of
// submission, when `status` is set to `awaiting_qsl` (see there). The caller
// has already looked up `applicant` anyway (email/name/language for the
// rule-engine evaluation), we don't duplicate the query.
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

// Same as schemas/users/users.js's formatName() (intentionally a separate
// copy — see the justification at the top of the file about schema-file
// independence).
function formatName(lang, firstName, lastName) {
    return lang === 'hu' ? `${lastName} ${firstName}` : `${firstName} ${lastName}`;
}

// Assembling the `fieldValues` map for CERT_RENDERER.renderPdf()'s
// overlayFields from an APPROVED submission (see
// schemas/diplomas/diplomas.js's OVERLAY_KEYS — only the fields actually
// enabled on the diploma appear on the final PDF, the renderer itself skips
// missing/empty keys). `points`/`categoryLabel`/`tierLabel`/`zoneLabel` are
// only meaningful for a `ruleMode:'points'` diploma (in checklist mode,
// submission.autoCheckDetails.mode is 'checklist', there's no concept of a
// score there) — the category/tier data comes from the autoCheckDetails.categories
// array computed AT UPLOAD TIME (based on the automatic points): if the
// manager later modified the score with a manual correction, this breakdown
// is NOT recomputed per category (the `points` field, however, shows the
// FINAL, corrected `submission.totalPoints`) — if a manual correction would
// actually tip over a tier boundary, this is a known, accepted limitation,
// not a bug. If multiple categories are achieved at once, the one with the
// highest score (categoryPoints) goes on the certificate.
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

// The filename offered on download (Content-Disposition, see
// controllers/submissions.js's serve_diploma_pdf) — at user request
// (2026-09-18): "[callsign]-[diploma name]-[YYMMDD].pdf" format, so that the
// downloaded file's name is identifiable on its own (not just offering the
// raw storage key, `submissions/{id}/diploma.pdf`).
function sanitizeFilenamePart(text) {
    return String(text).trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}

function formatYymmdd(date) {
    let yy = String(date.getFullYear()).slice(-2);
    let mm = String(date.getMonth() + 1).padStart(2, '0');
    let dd = String(date.getDate()).padStart(2, '0');
    return yy + mm + dd;
}

function buildCertificateFilename(applicant, diploma, date) {
    return `${sanitizeFilenamePart(applicant.callsign)}-${sanitizeFilenamePart(diploma.name)}-${formatYymmdd(date)}.pdf`;
}

// Atomic serial number allocation + generating and storing the final
// (watermark-FREE) PDF diploma — called EXCLUSIVELY from the `decide`
// action's 'approve' branch, BEFORE the DB write that records the decision
// (see the comment there for why in this order). The diploma's
// `serialCounter` starts at `serialStart`, and on every approval we FIRST
// allocate the CURRENT value (the `findOneAndUpdate`'s
// `returnDocument:'before'` returns the document BEFORE THE INCREMENT), then
// it increments by one for the next approval — so a `serialStart:1`
// diploma's first actually issued certificate gets serial #1, not #2.
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
        issuedPdf: { filename: buildCertificateFilename(applicant, diploma, new Date()), storage: STORAGE.driver, key: key }
    };
}

// Approving a submission — serial number allocation + PDF generation
// (issueCertificate) + recording the decision + notification email. This is
// the SHARED logic between the manager's manual approval (see the 'decide'
// action's approve branch above) AND automatic approval (diploma.autoApprove,
// see controllers/submissions.js's upload_submission — called from there
// through the globally exported SUBMISSIONS_APPROVAL.approve below) —
// `reviewerId` is the approving manager's _id in the manual case, `null` for
// automatic approval (nobody reviewed it as a human, this is an auditable
// trace, see the submission's `reviewedBy` field). `$` is the caller's
// context — the usual `$` for a schema action, the controller's `self` when
// called from the controller (both have `.language`, and the internal
// `FUNC.logger($, ...)`/`RESOURCE($.language, ...)` calls work with both,
// see notifyPaymentConfirmed's similar pattern, also callable without `$`,
// below).
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

    // If the diploma charges a fee for the chosen delivery mode (PDF fee, or
    // for physical delivery, PDF fee + surcharge, see
    // modules/payment-pricing.js), the submission does NOT stop at
    // 'approved', but switches straight to 'awaiting_payment' — the PDF is
    // already generated/stored at THIS point, but its DOWNLOAD is locked in
    // the `serve_diploma_pdf` controller action until `pricing.pdfFee` is
    // actually paid (see `pdfDownloadAllowed` there). For automatic approval
    // (autoApprove) this is practically always 0 due to the diploma-save
    // validation (physical delivery is forbidden for autoApprove, but a PDF
    // fee technically remains allowed — if someone still configures a PDF
    // fee for it, it likewise switches to 'awaiting_payment', NOT 'approved',
    // so the "gets it immediately" promise isn't fully kept for this case;
    // this is intentional and consistent with manual approval's behavior).
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

// The controller (controllers/submissions.js's upload_submission, upload_qsl)
// calls the automatic approval and the manager notification FROM HERE, not
// through a schema route — a schema file's (schemas/) module-scope functions
// aren't reachable from elsewhere by default, so here, at file load time
// (outside NEWSCHEMA, but in the same closure), we make it globally
// available, following a pattern similar to the project's modules/-level
// global namespaces (ADIF_PARSER, RULE_ENGINE, CERT_RENDERER, etc.).
global.SUBMISSIONS_APPROVAL = { approve: approveSubmission, notifyReviewNeeded: notifyManagerReviewNeeded, notifyQslNeeded: notifyApplicantQslNeeded };

// Recomputes the submission's actual totalPoints based on the RAW autoPoints
// (qsoBreakdown, already computed per-QSO by the rule engine using the
// "global maximum" logic, see modules/rule-engine.js) and manualAdjustments —
// ALWAYS from the full list, not incrementally, so that the global-maximum
// philosophy stays consistent with manual corrections too: a QSO-bound,
// RULE-based manual correction (`ruleBased:true`, see the adjustPoints
// action) represents ANOTHER matching rule that the system perhaps only
// recognized with human confirmation — this does NOT add to the points of
// the automatically found best rule, but competes with it the same way: the
// HIGHER of the two counts (user feedback: "it doesn't get +3 points, it
// changes to 3"). An INDIVIDUAL (non-rule-based) manual correction, however,
// is a genuine credit/deduction independent of the rule system — that STILL
// adds up (whether QSO-bound or not — and the non-QSO-bound corrections,
// since they have nothing to "compete" with, always add up).
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

    // Safety net: if a manualAdjustments qsoRef is accidentally not present
    // in qsoBreakdown (shouldn't happen — the adjustPoints action verifies
    // the qsoRef's existence at creation time), don't lose the points
    // belonging to it.
    for (let key in byQso) {
        total += (byQso[key].bestRulePoints || 0) + byQso[key].customSum;
    }

    return total;
}
