// submissions.js — the radio amateur's log-submission workflow: uploading a
// log for a diploma, automatic evaluation (modules/rule-engine.js), determining
// the submission's status, then listing/viewing one's own submissions.
// The actual creation (upload_submission) is built on a plain multipart form
// POST (no dedicated frontend JS, the same
// approach as throughout controllers/diplomas-public.js) — the file
// upload itself follows the pattern of diplomas-admin.js's upload_blank (the
// `self.files`/`self.body` Total.js multipart fields, ['upload'] route flag).
const Fs = require('fs');

// In these statuses we do NOT allow a new submission for the same diploma —
// the radio amateur may only submit again after an explicit rejection
// (automatic or by a manager). See findBlockingSubmission().
const NON_BLOCKING_STATUSES = ['rejected_auto', 'rejected'];

// Status -> Bulma tag color (for displaying the submissions.status.* resource
// keys in the list/detail views). Steps 8-9 (manager review, PDF) will add
// further status transitions; this list already contains the
// full STATUSES enumeration (the earlier STATUSES constant from
// schemas/submissions/submissions.js, needed here only for display).
const STATUS_CSS = {
    submitted: 'is-light',
    rejected_auto: 'is-danger',
    awaiting_qsl: 'is-warning',
    pending_review: 'is-info',
    approved: 'is-success',
    rejected: 'is-danger',
    awaiting_payment: 'is-warning',
    paid: 'is-success',
    completed: 'is-success',
    // Challenge-only status — the application has been accepted, the current
    // round's targets are not all fulfilled yet (see apply_challenge/
    // upload_challenge_log). The other challenge statuses reuse the STANDARD
    // enumeration (awaiting_qsl/pending_review/approved/
    // rejected_auto/etc.) — see the comments above the challenge-specific
    // functions.
    challenge_in_progress: 'is-warning'
};

exports.install = function () {
    ROUTE('GET /submissions', view_list);
    ROUTE('GET /submissions/new/{diplomaId}', view_new);
    ROUTE('GET /submissions/{id}', view_detail);
    ROUTE('+POST /upload/submissions/{diplomaId}', upload_submission, ['upload'], Number(process.env.UPLOAD_MAX_FILE_SIZE_IN_KB));
    // QSL confirmation upload (step 7) — an image/scan for the confirmation of
    // each drawn QSO. `qsoRef` is the array index within
    // submissions.qsoBreakdown/qslRequests (see modules/rule-engine.js), NOT a
    // standalone Mongo _id.
    ROUTE('+POST /upload/submissions/{id}/qsl/{qsoRef}', upload_qsl, ['upload'], Number(process.env.UPLOAD_MAX_FILE_SIZE_IN_KB));
    ROUTE('GET /uploads/submissions/{id}/qsl/{qsoRef}', serve_qsl);

    // Challenge diploma application / per-round log+QSL upload (see the
    // "=== Challenge ===" section at the bottom of the file) — the
    // challenge counterparts of the standard four routes above. `{round}` is
    // ALWAYS the 1-based roundNumber (not an array index), and every such
    // route checks server-side whether this is actually the CURRENT round
    // (see checkRoundMatchesCurrent) — it rejects a POST from a stale browser
    // tab (where the round has already advanced) instead of silently
    // overwriting an earlier round's data.
    ROUTE('+POST /submissions/apply/{diplomaId}', apply_challenge);
    ROUTE('+POST /upload/submissions/{id}/challenge/{round}/log', upload_challenge_log, ['upload'], Number(process.env.UPLOAD_MAX_FILE_SIZE_IN_KB));
    ROUTE('+POST /upload/submissions/{id}/challenge/{round}/qsl/{targetRef}', upload_challenge_qsl, ['upload'], Number(process.env.UPLOAD_MAX_FILE_SIZE_IN_KB));
    ROUTE('GET /uploads/submissions/{id}/challenge/{round}/qsl/{targetRef}', serve_challenge_qsl);
    // Downloading the final PDF diploma generated upon approval (step 9) —
    // the same access rule as for viewing the submission.
    ROUTE('GET /uploads/submissions/{id}/diploma', serve_diploma_pdf);
    ROUTE('+GET /api/submissions *Submissions/Submissions --> query');
    ROUTE('+GET /api/submissions/{id} *Submissions/Submissions --> get');

    // Manager review (step 8) — viewing the submission happens on the same
    // /submissions/{id} page (view_detail, isReviewer flag); only the
    // queue page (`/admin/submissions`) and the decision/point-correction
    // JSON APIs are separate.
    ROUTE('GET /admin/submissions', view_review_list);
    ROUTE('+GET /api/admin/submissions *Submissions/Submissions --> reviewQueue');
    ROUTE('+POST /api/submissions/{id}/points *Submissions/Submissions --> adjustPoints');
    ROUTE('+POST /api/submissions/{id}/decide *Submissions/Submissions --> decide');

    // Payment (step 10) — the actual Stripe/PayPal webhooks and the
    // payment-return pages are in a separate controller
    // (controllers/payments.js), because those are external calls NOT tied
    // to $.user — these three actions here are all tied to the logged-in
    // user (the submission's owner initiates the payment, the manager
    // approves/closes it).
    ROUTE('+POST /api/submissions/{id}/pay *Submissions/Submissions --> pay');
    ROUTE('+POST /api/submissions/{id}/pay/bank-confirm *Submissions/Submissions --> confirmBankTransfer');
    ROUTE('+POST /api/submissions/{id}/complete *Submissions/Submissions --> markCompleted');
};

// Same as controllers/diplomas-admin.js's isManager() (intentionally a
// separate copy, see the pattern there).
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
    await checkChallengeDeadlines(result);

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
    // Query-string based error feedback (see upload_submission's redirects)
    // — there's no dedicated JS/flash mechanism on this page, the same pattern
    // as throughout diplomas-public.js. The 'internal' code uses the ALREADY
    // EXISTING, generic error.internal key (no point duplicating it). The
    // RESOURCE() call happens here, in the controller (not in the view) — the
    // same pattern as all the parameterized @(#...) texts in diplomas-public.js.
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
    await checkChallengeDeadline(submission);

    self.repository.isOwner = submission.userId === self.user._id;
    // canAccessSubmission above already only let through three cases: owner,
    // sa, or the diploma's assigned manager — so if it's NOT the owner who
    // got here, it can only be sa/manager, i.e. a reviewer. The owner is
    // NEVER a reviewer, EVEN IF they otherwise happen to be sa/manager (e.g.
    // the manager submitted a log for themselves using their own callsign) —
    // nobody may review their own submission, this rule was introduced
    // following user feedback (see the same server-side enforcement in the
    // Submissions/Submissions adjustPoints/decide actions too). EXCEPTION: in
    // `DEBUG` mode (Total.js global, true only in the development
    // environment) the owner IS ALSO considered a reviewer if they're
    // otherwise sa/the diploma's manager — at user request, so that a single
    // test-manager account can be used to walk through the entire review
    // process without having to create a second account. In PRODUCTION
    // (non-DEBUG) this exception never runs.
    let isReviewer = !self.repository.isOwner;
    let diploma = null;

    if (self.repository.isOwner && DEBUG) {
        diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) }, { projection: { matchRules: 1, type: 1, managerId: 1 } });
        isReviewer = self.user.sa || !!(diploma && diploma.managerId === self.user._id);
    }

    self.repository.isReviewer = isReviewer;

    // The diploma's actual rule list (matchRules) is only needed by the
    // reviewer, and only while there's actually something to review — the
    // per-row manual correction (see the "Review" panel in
    // views/submissions/detail.html) offers these as selectable rules (the
    // point value comes from the rule, not from the client — see the
    // Submissions/Submissions adjustPoints action).
    self.repository.diplomaRuleOptions = [];

    if (self.repository.isReviewer && submission.status === 'pending_review') {
        if (!diploma) {
            diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) }, { projection: { matchRules: 1, type: 1 } });
        }
        self.repository.diplomaRuleOptions = buildRuleOptions(diploma, self.language);
    }

    // Who applied each manual correction — it's important that this ALWAYS be
    // visible (not just to the manager who is current at the moment the
    // submission is reviewed), because a diploma's responsible manager can
    // change over time, and without knowing the managerId, the correction
    // history alone would not reveal afterward who the actual
    // decision-maker was (user request).
    let managerInfoByUserId = await resolveManagerInfo(submission.manualAdjustments);

    self.repository.submission = decorateSubmission(submission, self.language, managerInfoByUserId);

    // The confirmation types the manager has marked as accepted (on the
    // settings-admin QSL tab) — the QSL upload section lists what we accept
    // based on this (see views/submissions/detail.html).
    let settings = await SETTINGS.get();
    self.repository.qslTypesAllowed = settings.qslTypesAllowed || [];

    // Challenge-specific message parameterized with the round number (see
    // checkChallengeDeadline) — assembled in the controller (not in the view
    // via a `RESOURCE(...)` call + `.replace(...)`), the same pattern as the
    // other parameterized resource texts in this file (see
    // notifyApplicantQslNeeded's intro).
    self.repository.deadlineMissedText = (submission.diplomaInfo && submission.diplomaInfo.type === 'challenge' && submission.status === 'rejected_auto' && submission.failureReason === 'round_deadline')
        ? RESOURCE(self.language, 'submissions.detail.challenge.deadline.missed').replace('{0}', String(submission.failedRound))
        : null;
    // Query-string based error feedback for the QSL image upload form (see
    // upload_qsl's redirects) — the same pattern as in view_new.
    self.repository.errorMessage = self.query.error
        ? RESOURCE(self.language, self.query.error === 'internal' ? 'error.internal' : 'error.submission.' + self.query.error)
        : null;
    // Stripe/PayPal's cancel_url redirects back here with `?payment=cancelled`
    // — there's no status change involved, just an informational message.
    self.repository.paymentCancelledMessage = self.query.payment === 'cancelled'
        ? RESOURCE(self.language, 'submissions.detail.payment.cancelled')
        : null;

    // Payment info (step 10) — only needed for the statuses where it's
    // actually relevant (awaiting payment / already paid / completed). The
    // `pdfDownloadAllowed` reflects the SAME logic as serve_diploma_pdf
    // (see there) — if the diploma requires a pdfFee, the download button in
    // the view only appears if this is `true`.
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

// Turns the diploma's matchRules into the ready-made (index+text+points)
// option list for the per-row manual correction <select> — only meaningful
// for `standard` type diplomas (the `challenge` type is not matchRules-based,
// see the DIPLOMA_TYPES comment in schemas/diplomas/diplomas.js). The
// description text calls describeMatchedRule() (see below), using the SAME
// localized template that the QSO table displays for an automatically
// matched rule — the field is named `label` in the diploma schema, while
// describeMatchedRule expects `ruleLabel`, hence the field renaming.
function buildRuleOptions(diploma, language) {
    if (!diploma || (diploma.type || 'standard') !== 'standard' || !Array.isArray(diploma.matchRules))
        return [];

    return diploma.matchRules.map((rule, index) => {
        let described = describeMatchedRule({ field: rule.field, operator: rule.operator, value: rule.value, points: rule.points, ruleLabel: rule.label || null }, language);
        return { index: index, text: described.text, points: rule.points };
    });
}

// Manager review queue (step 8) — server-rendered, directly via
// MDB+decorateSubmission (no JS/fetch, the same pattern as view_list above —
// it does NOT go through the Submissions/Submissions reviewQueue API action;
// that exists for the completeness of the schema's own API surface, see the
// similar, currently frontend-JS-unused role of the query/get actions).
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

    // The delivery mode (PDF-only / physical too) can only be accepted as
    // "physical" if the diploma actually offers it — we re-verify the
    // client-side choice here, server-side too, we don't trust the form
    // field (a direct POST can also arrive bypassing view_new).
    let deliveryChoice = (self.body && self.body.deliveryChoice === 'physical' && diploma.physicalOfferEnabled) ? 'physical' : 'pdf';

    // The projection gives enough data both for the rule engine (country)
    // AND for a possible automatic approval (diploma.autoApprove, see below),
    // so that a separate query isn't needed on the happy path.
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

    // Status decision: eligibleAuto=false -> automatic, final rejection
    // (no manager action needed). eligibleAuto=true -> either awaiting QSL
    // sampling (if the diploma actually requires a QSL, see qslSampleCount),
    // or it goes straight into the manager-review queue (step 8, if the
    // diploma has no QSL sampling configured).
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

    // Automatic approval (at user request): if the diploma is configured
    // this way (autoApprove, see the save validation in
    // schemas/diplomas/diplomas.js — it can only be saved this way if there's
    // no QSL sampling and no physical delivery offered), a submission that
    // the rule engine has ACCEPTED (not requiring QSL, so it ended up in
    // pending_review) here, IMMEDIATELY, without manager intervention, goes
    // through the same approval logic (serial number allocation + PDF
    // generation + notification) that the manager's manual "Approve" button
    // also runs (see schemas/submissions/submissions.js
    // approveSubmission/SUBMISSIONS_APPROVAL — `reviewerId:null`, because
    // it's not a human decision). On error (e.g. PDF rendering fails) the
    // submission SIMPLY remains in pending_review status — the manager can
    // review it manually, there's no lost/broken state.
    if (status === 'pending_review') {
        if (diploma.autoApprove) {
            let result = await SUBMISSIONS_APPROVAL.approve(self, doc, diploma, applicant, null, null);

            if (result.error) {
                FUNC.logger(self, `Submissions upload: auto-approve FAILED for ${submissionId}: ${result.error}`);
            } else {
                FUNC.logger(self, `Submissions upload: auto-approved ${submissionId} -> ${result.status}${result.serialNumber ? ` (serial ${result.serialNumber})` : ''}`);
            }
        } else {
            // No QSL sampling (qslRequests empty) -> the submission landed
            // here directly, we notify the manager ALREADY at the moment of
            // submission (see the user request: no notification needed for
            // an automatic diploma, and for QSL sampling only once the
            // amateur has uploaded everything - see upload_qsl).
            await SUBMISSIONS_APPROVAL.notifyReviewNeeded(self, doc, diploma);
        }
    } else if (status === 'awaiting_qsl') {
        // The diploma's QSL sampling drew some QSOs -> without this the
        // amateur might not notice they have something to do (user request,
        // 2026-09-18: easy to miss on the post-submission redirect).
        await SUBMISSIONS_APPROVAL.notifyQslNeeded(self, doc, diploma, applicant);
    }

    self.redirect('/submissions/' + submissionId);
}

// Uploading a QSL confirmation image/scan for a SPECIFIC drawn QSO (see
// drawQslSample below). Only the submission's OWNER may upload it (the
// manager will look at it later in step 8, not edit it here), and only while
// the submission is actually in the `awaiting_qsl` status — once a
// submission has already moved on (into pending_review, or been rejected),
// this can no longer be modified.
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

    // If this means an image now exists for EVERY drawn QSO, the submission
    // automatically advances to the manager-review queue — this "blocks
    // entering review" is intentional behavior: until every image is
    // present, the submission stays `awaiting_qsl`.
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

    // Only NOW, once every drawn QSL image is present and the submission has
    // actually moved into pending_review, do we notify the manager - see the
    // user request: for QSL sampling, not at submission time but only once
    // the amateur has uploaded everything (autoApprove doesn't even come up
    // here, the diploma save already forbids configuring autoApprove +
    // QSL sampling together, see schemas/diplomas/diplomas.js).
    if (allUploaded) {
        let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) }, {
            projection: { managerId: 1, name: 1 }
        });

        if (!isDbError(diploma) && diploma)
            await SUBMISSIONS_APPROVAL.notifyReviewNeeded(self, submission, diploma);
    }

    self.redirect('/submissions/' + id);
}

// Serving the uploaded QSL image — the same access rule as for viewing the
// submission (canAccessSubmission): owner, the diploma's responsible
// manager, or superadmin.
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

// Downloading the final PDF diploma generated upon approval — the same
// access rule as for viewing the submission (canAccessSubmission).
// The second parameter of `self.file(path, downloadName)` sets the
// `Content-Disposition` header with the stored `filename`, so the browser
// does NOT offer the raw storage key (`submissions/{id}/diploma.pdf`) as the
// filename to save.
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

    // Locked while the diploma requires a pdfFee AND the submission hasn't
    // paid yet — the same logic as in view_detail
    // (repository.pdfDownloadAllowed), enforced SEPARATELY here too, because
    // this route is also reachable directly by URL, without the download
    // button.
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

// Draws `count` items, without replacement, from among the QSOs that
// actually contribute to fulfilling the diploma (not excluded, matching at
// least one rule) (Fisher-Yates shuffle + the first `count` elements) — if
// there are fewer such QSOs than the diploma would request, all of them get
// drawn. For `count<=0`, an empty array (no QSL sampling for this diploma).
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

// Only `status:'active'`, `type:'standard'` (or the field missing, for old
// diplomas — see the `diploma.type || 'standard'` convention in
// schemas/diplomas/diplomas.js), and (if present) the deadline not yet
// passed. For the `challenge` type it intentionally returns `null` — that
// has its own (separate) application process, this general log submission
// doesn't apply to it.
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

// See the NON_BLOCKING_STATUSES comment above — an EXISTING submission of
// any status blocks a new one, except the explicitly rejected ones.
async function findBlockingSubmission(diplomaId, userId) {
    let submission = await MDB.findOne(process.env.MONGODB_DB_NAME, 'submissions', {
        diplomaId: diplomaId,
        userId: userId,
        status: { $nin: NON_BLOCKING_STATUSES }
    });

    return isDbError(submission) ? null : submission;
}

// ================= Challenge diploma =================
// The challenge diploma's application -> per-round draw -> log+QSL
// upload -> (autoApprove or manager-review) workflow. See
// modules/challenge-engine.js for the draw/match checking, and
// schemas/submissions/submissions.js's SUBMISSIONS_APPROVAL for the reused
// approval logic (approve/notifyReviewNeeded/notifyQslNeeded) — those
// functions are TYPE-INDEPENDENT, we don't duplicate them here.

// Same as loadSubmittableDiploma, just with reversed type filtering —
// loadSubmittableDiploma is INTENTIONALLY left unmodified (it must continue
// to serve EXCLUSIVELY the standard log-upload path).
async function loadApplicableChallengeDiploma(id) {
    let diploma;

    try {
        diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(id), status: 'active' });
    } catch (e) {
        return null;
    }

    if (isDbError(diploma) || !diploma)
        return null;

    if ((diploma.type || 'standard') !== 'challenge')
        return null;

    if (diploma.deadlineType === 'deadline' && diploma.deadlineDate && new Date(diploma.deadlineDate) < new Date())
        return null;

    return diploma;
}

// Lazy/reactive deadline check (there's NO cron module in the project, see
// the similarly lazy check of the diploma-level deadlineDate in
// loadSubmittableDiploma) — something actually only runs when someone (the
// applicant or a manager) actually opens/modifies the submission. If the
// CURRENT round's deadline has passed, it fails the ENTIRE challenge
// (`rejected_auto`, `failureReason:'round_deadline'`) — the same way as a
// system-issued rejection in the standard flow (it stays among
// NON_BLOCKING_STATUSES, so the applicant can immediately apply again). It
// mutates the `submission` parameter IN PLACE, so the caller
// (view_detail/upload_challenge_*) sees the fresh state without further
// logic. We call it without `applicant`; we look up the data needed for the
// email here (not because every call site would have already looked it up
// anyway).
async function checkChallengeDeadline(submission) {
    if (!submission.diplomaInfo || submission.diplomaInfo.type !== 'challenge')
        return false;

    if (['challenge_in_progress', 'awaiting_qsl'].indexOf(submission.status) === -1)
        return false;

    let round = submission.rounds[submission.currentRoundIndex];

    if (!round || !round.deadlineAt || new Date(round.deadlineAt) >= new Date())
        return false;

    let now = new Date();

    await MDB.updateOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID(submission._id) }, {
        status: 'rejected_auto',
        failureReason: 'round_deadline',
        failedRound: round.roundNumber,
        updated: now
    });

    submission.status = 'rejected_auto';
    submission.failureReason = 'round_deadline';
    submission.failedRound = round.roundNumber;
    submission.updated = now;

    let applicant = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(submission.userId) }, {
        projection: { email: 1, firstName: 1, lastName: 1, language: 1 }
    });

    if (!isDbError(applicant) && applicant)
        await notifyChallengeDeadlineMissed(submission, applicant);

    FUNC.logger({ req: null, res: null }, `Submissions challenge deadline missed: ${submission._id} (round ${round.roundNumber}) -> rejected_auto`);

    return true;
}

// The same batch pattern as attachDiplomaInfo/attachApplicantInfo — called
// at view_list's OWN (logged-in user's) submission list, so that a
// challenge submission with an expired round is refreshed when the list is
// opened TOO, not only on the detail page.
async function checkChallengeDeadlines(submissions) {
    for (let i = 0, n = submissions.length; i < n; i++) {
        await checkChallengeDeadline(submissions[i]);
    }
}

// CLOSING a round (all targets fulfilled AND -- if there was QSL sampling --
// that is also fully uploaded): either drawing the next round (if there are
// more left), or finalizing the entire challenge (autoApprove or
// manager-review, using the SAME SUBMISSIONS_APPROVAL that the standard flow
// also uses -- see schemas/submissions/submissions.js). The caller has
// already looked up `applicant` anyway (email/name/language for
// notifyReviewNeeded/notifyQslNeeded), we don't duplicate it. `diploma` is a
// FRESH (JUST NOW queried) document from the caller -- we use the
// `diploma.challenge` field to read totalRounds/drawPerRound/
// roundDeadlineDays, NOT a copy "frozen" at application time -- at user
// request (2026-09-18, bug report: "QSL sample is set to 0, yet it still
// asks for QSL"): previously we stored the diploma configuration AT
// APPLICATION TIME in a submission.challengeSnapshot field, which resulted
// in the already-applied amateur's submission continuing to use the OLD,
// stale setting if the admin modified the diploma's settings (e.g. changed
// qslSampleCount from 1 to 0) while an application was ALREADY IN PROGRESS
// -- this challengeSnapshot field (and all logic built on it) has been
// COMPLETELY removed, the system now always reads the diploma's CURRENT
// state.
async function finalizeChallengeRound(self, submission, diploma, applicant) {
    let round = submission.rounds[submission.currentRoundIndex];
    round.status = 'completed';
    round.completedAt = new Date();

    let isLastRound = submission.currentRoundIndex + 1 >= diploma.challenge.totalRounds;

    if (!isLastRound) {
        let nextRoundNumber = round.roundNumber + 1;
        let targetValues = CHALLENGE_ENGINE.drawTargets(diploma.challenge, submission.usedTargets, diploma.challenge.drawPerRound);

        submission.usedTargets = submission.usedTargets.concat(targetValues.map(t => t.value));
        submission.currentRoundIndex += 1;
        submission.status = 'challenge_in_progress';
        submission.rounds.push({
            roundNumber: nextRoundNumber,
            targets: targetValues.map(t => ({ value: t.value, label: t.label, matched: false, matchedQso: null })),
            deadlineAt: diploma.challenge.roundDeadlineDays ? new Date(Date.now() + diploma.challenge.roundDeadlineDays * 86400000) : null,
            logFiles: [],
            status: 'awaiting_log',
            qslRequests: [],
            completedAt: null
        });

        await MDB.updateOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID(submission._id) }, {
            usedTargets: submission.usedTargets,
            currentRoundIndex: submission.currentRoundIndex,
            status: submission.status,
            rounds: submission.rounds,
            updated: new Date()
        });

        return;
    }

    if (diploma.autoApprove) {
        let result = await SUBMISSIONS_APPROVAL.approve(self, submission, diploma, applicant, null, null);

        if (result.error) {
            FUNC.logger(self, `Submissions challenge auto-approve FAILED for ${submission._id}: ${result.error}`);
        } else {
            FUNC.logger(self, `Submissions challenge auto-approved ${submission._id} -> ${result.status}${result.serialNumber ? ` (serial ${result.serialNumber})` : ''}`);
        }

        return;
    }

    submission.status = 'pending_review';

    await MDB.updateOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID(submission._id) }, {
        status: 'pending_review',
        rounds: submission.rounds,
        updated: new Date()
    });

    await SUBMISSIONS_APPROVAL.notifyReviewNeeded(self, submission, diploma);
}

// We only allow the upload if the round given in the URL is ACTUALLY the
// current one -- we reject a POST from a stale browser tab (where the round
// has already advanced because the user finished it on another tab/device),
// we don't silently allow overwriting an earlier (already closed) round's
// data.
function isCurrentRound(submission, round) {
    let current = submission.rounds[submission.currentRoundIndex];
    return !!current && current.roundNumber === Number(round);
}

async function apply_challenge(diplomaId) {
    let self = this;

    if (!self.user) {
        self.throw401();
        return;
    }

    let diploma = await loadApplicableChallengeDiploma(diplomaId);

    if (!diploma) {
        self.redirect('/diplomas');
        return;
    }

    let blocking = await findBlockingSubmission(diplomaId, self.user._id);

    if (blocking) {
        self.redirect('/submissions/' + blocking._id);
        return;
    }

    let challenge = diploma.challenge;
    let targets = CHALLENGE_ENGINE.drawTargets(challenge, [], challenge.drawPerRound);

    let doc = {
        _id: MDB.ObjectID(),
        diplomaId: String(diploma._id),
        userId: self.user._id,
        serialNumber: null,
        usedTargets: targets.map(t => t.value),
        currentRoundIndex: 0,
        rounds: [{
            roundNumber: 1,
            targets: targets.map(t => ({ value: t.value, label: t.label, matched: false, matchedQso: null })),
            deadlineAt: challenge.roundDeadlineDays ? new Date(Date.now() + challenge.roundDeadlineDays * 86400000) : null,
            logFiles: [],
            status: 'awaiting_log',
            qslRequests: [],
            completedAt: null
        }],
        failureReason: null,
        failedRound: null,
        deliveryChoice: 'pdf',
        manualAdjustments: [],
        totalPoints: 0,
        status: 'challenge_in_progress',
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
        self.redirect('/diplomas/' + diplomaId + '?error=internal');
        return;
    }

    FUNC.logger(self, `Submissions challenge apply: ${doc._id} (diploma ${diplomaId}, user ${self.user._id})`);

    self.redirect('/submissions/' + doc._id);
}

async function upload_challenge_log(id, round) {
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

    await attachDiplomaInfo([submission]);
    await checkChallengeDeadline(submission);

    if (submission.status !== 'challenge_in_progress' || !isCurrentRound(submission, round)) {
        self.redirect('/submissions/' + id);
        return;
    }

    let currentRound = submission.rounds[submission.currentRoundIndex];

    if (currentRound.status !== 'awaiting_log') {
        self.redirect('/submissions/' + id);
        return;
    }

    if (!self.files || !self.files.length) {
        self.redirect('/submissions/' + id + '?error=file.required');
        return;
    }

    let file = self.files[0];
    let text;

    try {
        text = Fs.readFileSync(file.path, 'utf8');
    } catch (e) {
        self.redirect('/submissions/' + id + '?error=file.required');
        return;
    }

    let qsos = ADIF_PARSER.parse(text);

    if (!qsos.length) {
        self.redirect('/submissions/' + id + '?error=file.empty');
        return;
    }

    // We ALWAYS read the diploma fresh (not from a copy stored at
    // application time) -- at user request (2026-09-18, see
    // finalizeChallengeRound's comment): the admin can modify the challenge
    // settings (e.g. qslSampleCount) at any time, and this must take effect
    // IMMEDIATELY, for EVERY application already in progress, not only for
    // new ones starting afterward.
    let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) });

    if (isDbError(diploma) || !diploma) {
        self.redirect('/submissions/' + id + '?error=internal');
        return;
    }

    let ext = (file.filename.split('.').pop() || 'adi').toLowerCase().replace(/[^a-z0-9]/g, '') || 'adi';
    let key = `submissions/${id}/challenge/${round}/log-${currentRound.logFiles.length + 1}.${ext}`;

    await STORAGE.save(key, Fs.readFileSync(file.path));

    currentRound.logFiles.push({ filename: file.filename, storage: STORAGE.driver, key: key, uploadedAt: new Date() });

    let evaluation = CHALLENGE_ENGINE.evaluateRound(diploma.challenge, currentRound.targets, qsos);
    currentRound.targets = evaluation.targets;
    // Diagnostic breakdown of the MOST RECENTLY uploaded log (at user
    // request, 2026-09-18) -- every new upload OVERWRITES it (doesn't
    // append), because this is "what happened with your latest attempt"
    // feedback, not a cumulative history (the cumulative state is itself
    // reflected by the targets array's matched/matchedQso fields, see
    // decorateChallengeRound).
    currentRound.lastLogBreakdown = evaluation.qsoBreakdown;

    if (!evaluation.allMatched) {
        await MDB.updateOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID(id) }, {
            rounds: submission.rounds,
            updated: new Date()
        });

        FUNC.logger(self, `Submissions challenge log upload: ${id} round ${round} -> not all targets matched yet`);
        self.redirect('/submissions/' + id);
        return;
    }

    let applicant = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(self.user._id) }, {
        projection: { email: 1, firstName: 1, lastName: 1, language: 1, callsign: 1 }
    });

    if (isDbError(applicant) || !applicant) {
        self.redirect('/submissions/' + id + '?error=internal');
        return;
    }

    let qslCount = Math.min(diploma.challenge.qslSampleCount, diploma.challenge.drawPerRound);

    if (qslCount > 0) {
        currentRound.qslRequests = CHALLENGE_ENGINE.drawQslSample(currentRound.targets, qslCount);
        currentRound.status = 'awaiting_qsl';
        submission.status = 'awaiting_qsl';

        await MDB.updateOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID(id) }, {
            rounds: submission.rounds,
            status: 'awaiting_qsl',
            updated: new Date()
        });

        FUNC.logger(self, `Submissions challenge log upload: ${id} round ${round} -> all matched, awaiting_qsl`);

        // notifyApplicantQslNeeded only reads `submission._id` and
        // `submission.qslRequests.length` (see
        // schemas/submissions/submissions.js) — a minimal "shim" object is
        // enough for it, no need to transform the entire challenge document
        // (which doesn't even use a top-level qslRequests field).
        await SUBMISSIONS_APPROVAL.notifyQslNeeded(self, { _id: submission._id, qslRequests: currentRound.qslRequests }, diploma, applicant);
    } else {
        await MDB.updateOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID(id) }, {
            rounds: submission.rounds,
            updated: new Date()
        });

        await finalizeChallengeRound(self, submission, diploma, applicant);
    }

    self.redirect('/submissions/' + id);
}

async function upload_challenge_qsl(id, round, targetRef) {
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

    await attachDiplomaInfo([submission]);
    await checkChallengeDeadline(submission);

    if (submission.status !== 'awaiting_qsl' || !isCurrentRound(submission, round)) {
        self.redirect('/submissions/' + id);
        return;
    }

    let currentRound = submission.rounds[submission.currentRoundIndex];
    let index = currentRound.qslRequests.findIndex(r => String(r.qsoRef) === String(targetRef));

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
    let key = `submissions/${id}/challenge/${round}/qsl/${targetRef}.${ext}`;

    await STORAGE.save(key, Fs.readFileSync(file.path));

    currentRound.qslRequests[index].imageFile = { filename: file.filename, storage: STORAGE.driver, key: key };

    let allUploaded = currentRound.qslRequests.every(r => r.imageFile);

    let update = await MDB.updateOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID(id) }, {
        rounds: submission.rounds,
        updated: new Date()
    });

    if (isDbError(update)) {
        await STORAGE.delete(key);
        self.redirect('/submissions/' + id + '?error=internal');
        return;
    }

    FUNC.logger(self, `Submissions challenge QSL upload: ${id} round ${round} targetRef=${targetRef}${allUploaded ? ' (mind feltöltve)' : ''}`);

    if (allUploaded) {
        let applicant = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(self.user._id) }, {
            projection: { email: 1, firstName: 1, lastName: 1, language: 1, callsign: 1 }
        });

        let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(submission.diplomaId) });

        if (!isDbError(applicant) && applicant && !isDbError(diploma) && diploma) {
            await finalizeChallengeRound(self, submission, diploma, applicant);
        }
    }

    self.redirect('/submissions/' + id);
}

// The same access rule as in serve_qsl (canAccessSubmission).
async function serve_challenge_qsl(id, round, targetRef) {
    let self = this;

    if (!self.user) {
        self.throw401();
        return;
    }

    let submission;

    try {
        submission = await MDB.findOne(process.env.MONGODB_DB_NAME, 'submissions', { _id: MDB.ObjectID(id) }, { projection: { userId: 1, diplomaId: 1, rounds: 1 } });
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

    let targetRound = (submission.rounds || []).find(r => r.roundNumber === Number(round));
    let entry = targetRound && (targetRound.qslRequests || []).find(r => String(r.qsoRef) === String(targetRef));

    if (!entry || !entry.imageFile || !entry.imageFile.key || !(await STORAGE.exists(entry.imageFile.key))) {
        self.throw404();
        return;
    }

    await STORAGE.serve(self, entry.imageFile.key);
}

// The email to the applicant when the round's deadline has passed and the
// system consequently failed the entire challenge (see
// checkChallengeDeadline) — at user request (2026-09-18) they get notified
// the same way as for a manager rejection (notifyDecision,
// schemas/submissions/submissions.js), just without a manager remark here,
// the text uses its own, challenge-specific intro (the template itself,
// 'submissions/email-decision', is the same).
async function notifyChallengeDeadlineMissed(submission, applicant) {
    let language = applicant.language || 'hu';

    MAIL(applicant.email, RESOURCE(language, 'email.submission.challenge_failed.subject'), 'submissions/email-decision', {
        greeting: RESOURCE(language, 'email.greeting'),
        name: formatApplicantName(language, applicant.firstName, applicant.lastName),
        intro: RESOURCE(language, 'email.submission.challenge_failed.intro').replace('{0}', String(submission.failedRound)),
        remark: null,
        remark_label: RESOURCE(language, 'submissions.detail.review.remark'),
        btn_label: RESOURCE(language, 'email.submission.challenge_failed.btn'),
        submission_link: FUNC.emailLink(`/submissions/${submission._id}`),
        footer: RESOURCE(language, 'email.footer')
    }, language, function (err) {
        if (err) console.log(`Email ERROR (challenge deadline missed): ${applicant.email} -> ${err}`);
    });
}

// Same as schemas/submissions/submissions.js's formatName() (intentionally a
// separate copy, see the justification at the top of the file about
// schema-file independence) -- named `formatApplicantName` here so it
// doesn't collide with a possible future `formatName` living in this same
// controller scope.
function formatApplicantName(lang, firstName, lastName) {
    return lang === 'hu' ? `${lastName} ${firstName}` : `${firstName} ${lastName}`;
}

// The same rule as the Submissions/Submissions schema's canAccessSubmission()
// (schemas/submissions/submissions.js) — intentionally a separate copy, see
// the comment there (we don't want to trigger the schema's NEWSCHEMA
// registration from the controller).
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
        projection: { name: 1, type: 1, 'challenge.totalRounds': 1 }
    });

    if (isDbError(diplomas))
        return;

    let byId = {};
    for (let i = 0, n = diplomas.length; i < n; i++) {
        byId[String(diplomas[i]._id)] = diplomas[i];
    }

    for (let i = 0, n = submissions.length; i < n; i++) {
        let diploma = submissions[i].diplomaId && byId[submissions[i].diplomaId];
        // `totalRounds` here reflects the diploma's CURRENT setting (not a
        // value "frozen" at application time, see finalizeChallengeRound's
        // comment) — needed for the list/detail page's "N/M" round indicator
        // (decorateSubmission); if the admin modifies the number of rounds in
        // the meantime, this too appears freshly updated immediately.
        submissions[i].diplomaInfo = diploma ? { name: diploma.name, type: diploma.type || 'standard', totalRounds: diploma.challenge && diploma.challenge.totalRounds } : null;
    }
}

// Same as schemas/submissions/submissions.js's managedDiplomaIds()
// (intentionally a separate copy) — for view_review_list's diploma
// filtering.
async function managedDiplomaIds(userId) {
    let diplomas = await MDB.find(process.env.MONGODB_DB_NAME, 'diplomas', { managerId: userId }, { projection: { _id: 1 } });

    if (isDbError(diplomas))
        return [];

    return diplomas.map(d => String(d._id));
}

// Same as schemas/submissions/submissions.js's attachApplicantInfo()
// (intentionally a separate copy) — needed by view_review_list, so the
// manager can see who submitted the entry.
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

// Resolves the manualAdjustments entries' managerIds into an id -> {email,
// callsign} map, for the "applied by" column of the QSO table/history table
// (see decorateSubmission/describeQsoBreakdownItem). Only called by
// view_detail (the list views don't display the correction history).
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

// Returns the display identifier for a managerId (callsign, or email if
// that's absent) — `null` if the manager's userId can't be resolved for
// some reason (e.g. an account deleted in the meantime).
function managerDisplayText(managerId, managerInfoByUserId) {
    let info = managerId && managerInfoByUserId[managerId];
    return info ? (info.callsign || info.email) : null;
}

// Group labels (mode/band 'group' operator) — intentionally the exact same
// literal copy as controllers/diplomas-public.js's GROUP_LABELS/
// BAND_GROUP_LABELS (see the justification there above describeMatchRule:
// small, standalone helpers, not worth extracting into a shared module).
const GROUP_LABELS = { CW: 'CW', PHONE: 'Phone', DIGITAL: 'Digital', IMAGE: 'Image' };
const BAND_GROUP_LABELS = { HF: 'HF', VHF: 'VHF', UHF: 'UHF' };

// Turns the `submission` schema's stored fields (status, QSO breakdown,
// auto-check details) into a ready, localized textual form for the views —
// ALWAYS called on a document freshly loaded from MDB (doesn't persist
// anything).
function decorateSubmission(submission, language, managerInfoByUserId) {
    managerInfoByUserId = managerInfoByUserId || {};

    submission.statusLabel = RESOURCE(language, 'submissions.status.' + submission.status) || submission.status;
    submission.statusClass = STATUS_CSS[submission.status] || 'is-light';
    submission.deliveryLabel = RESOURCE(language, 'submissions.delivery.' + (submission.deliveryChoice || 'pdf'));

    // Callsign resolution for the manualAdjustments history table (see
    // below) — from the RAW (not yet decorated) qsoBreakdown, because the
    // decorated form no longer contains the call field directly indexable by
    // qsoRef (describeQsoBreakdownItem maps it, doesn't key it).
    let qsoCallByRef = {};
    if (Array.isArray(submission.qsoBreakdown)) {
        for (let i = 0, n = submission.qsoBreakdown.length; i < n; i++) {
            qsoCallByRef[String(submission.qsoBreakdown[i].qsoRef)] = submission.qsoBreakdown[i].call;
        }
    }

    // Grouped by QSO (qsoRef -> array) — the non-QSO-specific corrections
    // (qsoRef==null) are intentionally left out here, they only appear in
    // the history table below.
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

    // The history of manual point corrections (see the Submissions/
    // Submissions adjustPoints action) — visible to the owner TOO
    // (transparency, they're also affected by the point change), not just to
    // the manager. QSO-bound entries ALSO appear at the qsoBreakdown rows
    // above (describeQsoBreakdownItem's manualEntries field) — here the
    // FULL history is visible, complemented with the QSO callsign, so that
    // the non-QSO-specific (qsoRef==null) corrections can also be tracked in
    // one place.
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

    // Challenge-specific fields (see the "=== Challenge ===" section of the
    // file) — for a standard submission, `rounds` is not present, this block
    // simply doesn't run.
    if (Array.isArray(submission.rounds)) {
        submission.currentRoundNumber = submission.currentRoundIndex + 1;
        // We look at the diploma's CURRENT totalRounds (attachDiplomaInfo
        // fills it in, see there) -- not a value frozen at application time.
        submission.totalRounds = (submission.diplomaInfo && submission.diplomaInfo.totalRounds) || submission.rounds.length;
        submission.challengeRoundText = `${submission.currentRoundNumber}/${submission.totalRounds}`;
        submission.rounds = submission.rounds.map(r => decorateChallengeRound(r, submission._id, language));
        // The view always displays the CURRENT round for the log/QSL upload
        // form (only one round is active at a time) — plain property access,
        // not array indexing in the view (the Total.js view engine expects
        // simple property paths, see the view-engine quirks described at the
        // top of the file/in CLAUDE.md).
        submission.currentRound = submission.rounds[submission.currentRoundIndex];
    }

    return submission;
}

// A challenge round's display-ready form — resolving dates/status labels,
// and the QSL image URL points to the round-scoped serve_challenge_qsl
// route (NOT the standard /qsl/{qsoRef}, see the top of the file: a qsoRef
// is only unique WITHIN a round).
function decorateChallengeRound(round, submissionId, language) {
    return {
        roundNumber: round.roundNumber,
        status: round.status,
        statusLabel: RESOURCE(language, 'submissions.detail.challenge.round.status.' + round.status),
        deadlineAtText: round.deadlineAt ? new Date(round.deadlineAt).toLocaleString(language) : null,
        completedAtText: round.completedAt ? new Date(round.completedAt).toLocaleString(language) : null,
        matchedCount: round.targets.filter(t => t.matched).length,
        targetCount: round.targets.length,
        targets: round.targets.map(t => ({
            value: t.value,
            label: t.label,
            matched: !!t.matched,
            matchedQso: t.matchedQso ? {
                call: t.matchedQso.call,
                band: t.matchedQso.band,
                mode: t.matchedQso.mode,
                qsoDateText: t.matchedQso.qsoDate ? new Date(t.matchedQso.qsoDate).toLocaleString(language) : ''
            } : null
        })),
        qslRequests: (round.qslRequests || []).map(r => ({
            qsoRef: r.qsoRef,
            call: r.call,
            uploaded: !!r.imageFile,
            imageUrl: r.imageFile ? `/uploads/submissions/${submissionId}/challenge/${round.roundNumber}/qsl/${r.qsoRef}` : null
        })),
        // Diagnostic breakdown of the most recently uploaded log (at user
        // request, 2026-09-18 — see modules/challenge-engine.js's
        // evaluateRound()) — the absence of `excludedReason` signals a
        // successful match (`matchedTargetValue`/`matchedTargetLabel` is
        // filled in).
        lastLogBreakdown: (round.lastLogBreakdown || []).map(entry => ({
            call: entry.call,
            band: entry.band,
            mode: entry.mode,
            comment: entry.comment,
            qsoDateText: entry.qsoDate ? new Date(entry.qsoDate).toLocaleString(language) : '',
            matchedText: entry.matchedTargetValue ? RESOURCE(language, 'submissions.detail.challenge.qso.matched').replace('{0}', entry.matchedTargetLabel || entry.matchedTargetValue) : null,
            reasonText: entry.excludedReason ? RESOURCE(language, 'submissions.detail.challenge.qso.reason.' + entry.excludedReason) : null
        }))
    };
}

// Applies the SAME "global maximum" logic for printing the points column as
// the schema's computeTotalPoints() (schemas/submissions/submissions.js,
// intentionally a separate copy) — a rule-based (`ruleBased:true`) manual
// correction does NOT add to the auto points, but competes with it (the
// higher one counts); an individual (non-rule-based) correction, however,
// STILL adds up. Without this, the UI would have wrongly displayed, as an
// "autoPoints + manualPoints" ADDITION, something that is actually an
// OVERRIDE (see the user feedback: "it doesn't get +3 points, it changes to
// 3").
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
        // The log's raw COMMENT field — the manager sees what the operator
        // actually wrote (e.g. "YL"), without this they could only guess why
        // a COMMENT-based rule failed to match automatically (see the user
        // justification for the per-row manual correction).
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
                // The "manual" label is supplemented with the managerId's
                // resolved identifier (callsign/email) — it's important that
                // the correction history clearly shows afterward, even after
                // a manager change, WHO made the decision (user request).
                manualLabel: managerText ? `${manualLabel} — ${managerText}` : manualLabel
            };
        }),
        effectivePoints: effectivePoints
    };
}

// The human-language description of a matched rule (an element of
// RULE_ENGINE.evaluate's matchedRules, or an element of a checklist's
// checklistResults) — the same pattern as controllers/diplomas-public.js's
// describeMatchRule() (a manager-given free text takes priority, otherwise a
// field+condition template), extended with the separate text for the
// repeater bonus (field:'repeater', see modules/rule-engine.js).
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

// Turns RULE_ENGINE.evaluate()'s autoCheckDetails (see
// modules/rule-engine.js) into a form ready for detail.html. In checklist
// mode, every rule gets the fulfilled/not-fulfilled indicator + the
// description; in points mode, either the per-category tier breakdown
// (tiersEnabled), or the plain zone threshold (the absence of the
// `categories` field decides which one it is — see
// modules/rule-engine.js's evaluatePointsFlat/evaluatePointsTiers).
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
