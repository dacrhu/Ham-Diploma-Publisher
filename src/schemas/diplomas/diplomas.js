// Diplomas/Diplomas — admin (manager) management of diploma definitions: base data,
// rule set (checklist/points), payment, PDF overlay layout. Uploading/serving the
// blank certificate image goes through separate controller routes (not through
// this schema) — see controllers/diplomas-admin.js.
// The 'mode' field matches the ADIF MODE (points per operating mode, e.g. CW 3,
// SSB 2, FM 1, Digi 1) — see modules/adif-modes.js for the background of the 'group' operator.
// The 'band' field matches the ADIF BAND (points per band, e.g. 80m 3,
// 40m 2, OR a diploma can only be completed on certain bands, e.g. only
// 80m/40m) — see modules/adif-bands.js for the background of the 'group' operator.
const RULE_FIELDS = ['call', 'comment', 'qth', 'mode', 'band'];
// 'regex' is currently only available for the 'call' field (in the admin UI) — for
// cases where a wildcard (*/?) isn't precise enough, e.g. an Austrian "two-letter
// suffix only" diploma: ^OE\d[A-Z]{2}$ (the wildcard "OE7??" would also work for this,
// but regex can also distinguish e.g. letter/digit, which "?" cannot).
// 'group' is only interpreted for the 'mode' and 'band' fields — its value is a
// member of ADIF_MODES.GROUP_NAMES (e.g. "DIGITAL") or ADIF_BANDS.GROUP_NAMES (e.g. "VHF"),
// and matches any concrete mode/band value belonging to that group,
// without the diploma having to list each one individually.
const RULE_OPERATORS = ['wildcard', 'regex', 'contains', 'equals', 'in_list', 'group'];
const RULE_MODES = ['checklist', 'points'];
// Duplicate handling (mainly matters in points mode — the log can contain multiple
// QSOs with the same station): 'allowed' = every one counts (e.g. a
// pure activity diploma, where a repeated contact is also worth points), 'per_band_mode' =
// the same station only counts once per band/mode (the most common
// ham radio convention — it counts again on a different band/mode), 'once' = the same
// station counts only once in total, regardless of band/mode. The actual
// application happens later, in step 6's rule engine (actual deduplication of
// ADIF QSOs) — for now, only the diploma-level setting is being built here.
const DUPLICATE_POLICIES = ['allowed', 'per_band_mode', 'once'];
const STATUSES = ['draft', 'active', 'archived'];
const PAYMENT_METHODS = ['stripe', 'paypal', 'bank_transfer'];
const OVERLAY_KEYS = ['callsign', 'applicantName', 'serialNumber', 'diplomaName', 'issueDate', 'points', 'categoryLabel', 'tierLabel', 'zoneLabel'];
const DEFAULT_SERIAL_START = 1;

// Tiers (e.g. Bronze/Silver/Gold), only interpreted in points mode. A diploma
// always stores a `categories` array: if the manager doesn't enable the
// per-mode breakdown (categoriesEnabled=false), the array has exactly 1 element, the implicit
// "Mixed" category (modeFilter=null), within which the tier ladder runs. If it is
// enabled, multiple categories can be added (e.g. CW / Phone / Mixed), each with its
// OWN tier ladder (e.g. it's harder to reach the same score in CW than in
// Phone) — a submission can qualify in multiple categories at once (e.g. 40 CW +
// 40 SSB, both reach the minimum -> a certificate is issued for both categories). The
// actual evaluation (which category/tier was achieved) happens later, in step 6's
// rule engine — for now, only the diploma-level setting is being
// built here.
const CATEGORY_MODE_FILTERS = ADIF_MODES.GROUP_NAMES;

// Diploma type: 'standard' (log upload -> checklist/points rule engine,
// see above) or 'challenge' (application -> the system draws rounds from a
// pre-populated target pool, each round requires a QSO with each drawn target
// -> next round). For EXISTING diplomas, the `type` field is missing in Mongo
// (they were created before this field was introduced) -- everywhere it must be
// read as `diploma.type || 'standard'`, never assuming the field exists.
// IMPORTANT SCOPE: this only builds the admin-side CONFIGURATION of the
// challenge diploma (this object + the sanitizeChallenge/validation below).
// The actual application/drawing/per-round log upload/QSL/review/PDF is
// a LATER step.
const DIPLOMA_TYPES = ['standard', 'challenge'];

// Which ADIF field a drawn target is matched against: 'call' = an exact callsign
// (exact match), 'comment' = a free-form identifier from the log's COMMENT field (this is
// where the operator writes e.g. the repeater/DMR talkgroup name -- there's no dedicated ADIF
// field for it, PARTIAL/contains match), 'country' = callsign PREFIX match (e.g.
// "HA" or "OE" -- a simple "which country was worked" check without a
// full DXCC database, see modules/challenge-engine.js's isMatch(); the
// more precise, actual DXCC entity resolution remains a LATER step not
// built here). `challenge.commentFilterRegex` (see sanitizeChallenge)
// is an INDEPENDENT, STANDALONE, GLOBAL condition -- alongside any targetField,
// combined with AND, it ADDITIVELY restricts which QSOs are eligible
// (e.g. targetField:'country' for the callsign prefix, while commentFilterRegex
// SIMULTANEOUSLY requires a DMR talkgroup number of a given format).
const CHALLENGE_TARGET_FIELDS = ['call', 'comment', 'country'];

NEWSCHEMA('Diplomas/Diplomas', function (schema) {

    schema.action('query', {
        permissions: ['manager'],
        language: true,
        action: async function ($) {
            let query = {};

            // A plain (non-sa) manager can only see the diplomas assigned TO THEM — the
            // superadmin sees everything (see the same rule in get/save/delete).
            if (!$.user.sa)
                query.managerId = $.user._id;

            if ($.query.status)
                query.status = $.query.status;

            if ($.query.q)
                query.name = new RegExp($.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

            let page = Number($.query.page) || 0;
            let max = Number($.query.max) || 25;

            let result = await MDB.find(process.env.MONGODB_DB_NAME, 'diplomas', query, {
                projection: { matchRules: 0, overlayFields: 0, bankTransferDetails: 0 },
                skip: page * max
            }, { created: -1 }, max, true);

            if (isDbError(result)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            await attachManagerInfo(result.data);

            $.callback({ success: true, countFull: result.countFull, data: result.data });
        }
    });

    schema.action('get', {
        permissions: ['manager'],
        language: true,
        action: async function ($) {
            let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID($.params.id) });

            if (isDbError(diploma) || !diploma) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            if (!isDiplomaManagerOf($.user, diploma)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.forbidden') });
                return;
            }

            await attachManagerInfo([diploma]);

            $.callback({ success: true, data: diploma });
        }
    });

    // Layout preview with demo data: renders the CURRENTLY set (possibly not yet
    // saved) overlayFields from the Layout tab onto the blank image as a real
    // (not CSS-based, but actually generated) JPEG, so the manager can see how
    // the final certificate will look — without having to wait for a real
    // submission. No watermark (the demo data alone makes it clear that this
    // isn't a real, issued certificate).
    // The response is an image binary, NOT JSON — hence we call `$.controller.binary(...)`
    // instead of `$.callback(...)` on the success branch.
    schema.action('previewRender', {
        permissions: ['manager'],
        language: true,
        action: async function ($) {
            let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID($.params.id) }, { projection: { name: 1, blankImage: 1, managerId: 1 } });

            if (isDbError(diploma) || !diploma || !diploma.blankImage || !diploma.blankImage.key || !(await STORAGE.exists(diploma.blankImage.key))) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            if (!isDiplomaManagerOf($.user, diploma)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.forbidden') });
                return;
            }

            let overlayFields = sanitizeOverlayFields($.model && $.model.overlayFields);
            // The font/size also uses the CURRENT (selected in the live editor, possibly
            // not yet saved) value, just like overlayFields —
            // this way the preview really shows what the manager just set.
            let overlayFontFamily = CERT_RENDERER.FONT_FAMILIES[$.model && $.model.overlayFontFamily] ? $.model.overlayFontFamily : CERT_RENDERER.DEFAULT_FONT_FAMILY;
            let overlayFontSize = $.model && Number($.model.overlayFontSize) > 0 ? Number($.model.overlayFontSize) : CERT_RENDERER.DEFAULT_FONT_SIZE;

            let demoValues = {
                diplomaName: diploma.name,
                applicantName: RESOURCE($.language, 'diplomas.preview.demo.name'),
                callsign: RESOURCE($.language, 'diplomas.preview.demo.callsign'),
                points: RESOURCE($.language, 'diplomas.preview.demo.points'),
                serialNumber: RESOURCE($.language, 'diplomas.preview.demo.serial'),
                issueDate: new Date().toLocaleDateString($.language),
                categoryLabel: RESOURCE($.language, 'diplomas.preview.demo.category'),
                tierLabel: RESOURCE($.language, 'diplomas.preview.demo.tier'),
                zoneLabel: RESOURCE($.language, 'diplomas.preview.demo.zone')
            };

            try {
                let buffer = await CERT_RENDERER.render(await STORAGE.read(diploma.blankImage.key), diploma.blankImage.key, overlayFields, demoValues, false, overlayFontFamily, overlayFontSize);
                $.controller.binary(buffer, 'image/jpeg');
            } catch (e) {
                FUNC.logger($, `Diplomas/Diplomas previewRender error: ${e.message}`);
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
            }
        }
    });

    // Only safe as long as no submission is tied to the diploma (submissions,
    // from step 6 on) — afterwards it will need reconsidering whether to still allow it (or
    // make archiving the only path). For now it's specifically useful for a
    // manager (or me, during testing) to be able to delete an unnecessary/test diploma
    // without having to overwrite a real record for that purpose.
    schema.action('delete', {
        permissions: ['manager'],
        input: '*id:string',
        language: true,
        action: async function ($) {
            let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID($.model.id) }, { projection: { blankImage: 1, managerId: 1 } });

            if (!isDiplomaManagerOf($.user, diploma)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.forbidden') });
                return;
            }

            if (diploma && diploma.blankImage && diploma.blankImage.key) {
                await STORAGE.delete(diploma.blankImage.key);

                // The watermarked version (see controllers/diplomas-admin.js
                // upload_blank) is under a separate storage key — without this it would be
                // left orphaned here in the deleted diploma's folder.
                if (diploma.blankImage.watermarkedKey) {
                    await STORAGE.delete(diploma.blankImage.watermarkedKey);
                }
            }

            await MDB.deleteOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID($.model.id) });

            FUNC.logger($, `Diplomas/Diplomas delete: ${$.model.id}`);
            $.callback({ success: true });
        }
    });

    schema.action('save', {
        permissions: ['manager'],
        language: true,
        action: async function ($) {
            let model = $.model || {};
            let isUpdate = !!model.id;

            // Creating a new diploma is superadmin-only — a plain manager can only
            // edit diplomas already assigned TO THEM, they cannot create a new one
            // (see controllers/diplomas-admin.js view_edit's same restriction
            // on the 'new' editor page).
            if (!isUpdate && !$.user.sa) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.create.forbidden') });
                return;
            }

            let existingDiploma = null;

            if (isUpdate) {
                existingDiploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(model.id) }, { projection: { managerId: 1 } });

                if (!isDiplomaManagerOf($.user, existingDiploma)) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.forbidden') });
                    return;
                }
            }

            if (!model.name || !model.name.trim()) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.name') });
                return;
            }

            if (RULE_MODES.indexOf(model.ruleMode) === -1) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            let invalidRegex = findInvalidRegexRule(model.matchRules);
            if (invalidRegex) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.rule.regex') + ' (' + invalidRegex + ')' });
                return;
            }

            let invalidModeGroup = findInvalidGroupRule(model.matchRules, 'mode', ADIF_MODES.GROUP_NAMES);
            if (invalidModeGroup) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.rule.group') + ' (' + invalidModeGroup + ')' });
                return;
            }

            let invalidBandGroup = findInvalidGroupRule(model.matchRules, 'band', ADIF_BANDS.GROUP_NAMES);
            if (invalidBandGroup) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.rule.band.group') + ' (' + invalidBandGroup + ')' });
                return;
            }

            let type = DIPLOMA_TYPES.indexOf(model.type) !== -1 ? model.type : 'standard';
            let challenge = type === 'challenge' ? sanitizeChallenge(model.challenge) : {};

            if (type === 'challenge') {
                if (!challenge.targetField) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.challenge.target_field') });
                    return;
                }

                if (!challenge.targetPool.length) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.challenge.pool_empty') });
                    return;
                }

                // Without repetition, the pool must contain at least as many elements
                // as will be drawn during the whole challenge (number of rounds *
                // draws per round) -- otherwise the system would run out of
                // drawable (not yet drawn) elements in some round.
                if (!challenge.allowRepeatAcrossRounds && challenge.targetPool.length < challenge.drawPerRound * challenge.totalRounds) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.challenge.pool_too_small') });
                    return;
                }

                // commentFilterRegex is a STANDALONE, GLOBAL condition (per user
                // request, 2026-09-18) -- INDEPENDENT of the targetField/pool choice,
                // see modules/challenge-engine.js's passesFilters().
                if (challenge.commentFilterRegex && !isValidRegexString(challenge.commentFilterRegex)) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.challenge.comment_regex') });
                    return;
                }
            }

            // Auto-approve (per user request, AVAILABLE for both
            // diploma types): if the submission automatically meets the
            // conditions (standard: rule engine, challenge: all rounds
            // completed, see modules/challenge-engine.js), the manager review is
            // skipped and the certificate is issued IMMEDIATELY (see
            // controllers/submissions.js upload_submission/
            // finalizeChallengeRound + schemas/submissions/submissions.js
            // approveSubmission). This is INCOMPATIBLE with QSL
            // sampling (that would require the applicant to upload a
            // confirmation before anything is issued — breaking the "immediately"
            // promise) and with physical delivery (that requires manager
            // coordination/payment, it doesn't happen "immediately") — so this is
            // enforced here, on save, not just disabled in the UI. The
            // QSL sampling FIELD differs by type (standard:
            // model.qslSampleCount, challenge: challenge.qslSampleCount, from
            // the already computed/sanitized object above) — so this
            // validation could only go HERE, AFTER the type/challenge
            // computation.
            let autoApprove = !!model.autoApprove;
            let effectiveQslSampleCount = type === 'challenge' ? challenge.qslSampleCount : Math.max(0, Number(model.qslSampleCount) || 0);

            if (autoApprove && (effectiveQslSampleCount > 0 || !!model.physicalOfferEnabled)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.autoapprove.conflict') });
                return;
            }

            // Responsible manager (optional) — can only be chosen from users who ALREADY
            // have the 'manager' permission (or are sa), see the "who to contact
            // about this diploma" info that appears on the diploma list
            // and (once the public interface is built, step 5) on the public page too.
            // Assigning/reassigning this is intentionally SA-ONLY — a plain
            // manager cannot take away/hand over their own (or someone else's) diploma, so
            // for them, save ignores the submitted managerId,
            // and keeps the diploma's current assignment.
            let managerId = $.user.sa ? (model.managerId || '').trim() : ((existingDiploma && existingDiploma.managerId) || '');

            if (managerId && !/^[0-9a-f]{24}$/i.test(managerId)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.manager.invalid') });
                return;
            }

            if (managerId) {
                let managerUser = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(managerId) }, { projection: { permissions: 1, sa: 1 } });

                if (isDbError(managerUser) || !managerUser || !(managerUser.sa || (managerUser.permissions || []).indexOf('manager') !== -1)) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.diploma.manager.invalid') });
                    return;
                }
            }

            let matchRules = sanitizeMatchRules(model.matchRules);
            let overlayFields = sanitizeOverlayFields(model.overlayFields);
            // Per user request, the font size is NOT per-field but uniform across
            // the whole certificate (see the comment in modules/certificate-renderer.js) — the
            // font can also only be chosen from a closed list of actually installed
            // font families, not free text.
            let overlayFontFamily = CERT_RENDERER.FONT_FAMILIES[model.overlayFontFamily] ? model.overlayFontFamily : CERT_RENDERER.DEFAULT_FONT_FAMILY;
            let overlayFontSize = Number(model.overlayFontSize) > 0 ? Math.min(200, Math.max(6, Number(model.overlayFontSize))) : CERT_RENDERER.DEFAULT_FONT_SIZE;
            let paymentMethods = Array.isArray(model.paymentMethods) ? model.paymentMethods.filter(m => PAYMENT_METHODS.indexOf(m) !== -1) : [];
            let status = STATUSES.indexOf(model.status) !== -1 ? model.status : 'draft';
            let duplicatePolicy = DUPLICATE_POLICIES.indexOf(model.duplicatePolicy) !== -1 ? model.duplicatePolicy : 'per_band_mode';

            // Tiers are only interpreted in points mode (see the comment above
            // CATEGORY_MODE_FILTERS) — in checklist mode we always force them to a disabled state.
            let tiersEnabled = model.ruleMode === 'points' && !!model.tiersEnabled;
            let categoriesEnabled = tiersEnabled && !!model.categoriesEnabled;
            let categories = sanitizeCategories(model.categories, tiersEnabled, categoriesEnabled);

            let set = {
                name: model.name.trim(),
                description: (model.description || '').trim(),
                managerId: managerId || null,
                deadlineType: model.deadlineType === 'deadline' ? 'deadline' : 'continuous',
                deadlineDate: model.deadlineType === 'deadline' && model.deadlineDate ? new Date(model.deadlineDate) : null,
                ruleMode: model.ruleMode,
                duplicatePolicy: duplicatePolicy,
                // Allowed bands — a diploma-level, global VALIDITY filter,
                // INDEPENDENT of the matchRules 'band' field: the latter gives
                // POINTS for a band (or none, if there's no such rule), whereas this here
                // decides whether a QSO can be counted toward the diploma AT ALL,
                // regardless of scoring — e.g. for an HF contest diploma the manager
                // specifies that only 80m/40m/20m is valid, and a 2m QSO in the
                // log is therefore automatically invalid, even if it would otherwise
                // satisfy the checklist/points rules. Empty array = no
                // band restriction (every band is valid). The actual filtering will
                // happen later, in step 6's rule engine — for now, only the
                // diploma-level setting is being built here.
                allowedBands: sanitizeAllowedBands(model.allowedBands),
                matchRules: matchRules,
                // Repeater usage — a diploma-level, global rule —
                // NOT per matchRules row (since additive scoring doesn't mix
                // well with a "not allowed -> whole QSO excluded" logic). If
                // repeaterAllowed=false, a QSO made through a repeater doesn't count
                // toward the diploma at all; if true, repeaterPoints (only interpreted in points
                // mode) gives how many points such a contact is worth.
                // The actual application will happen later, in step 6's rule engine.
                repeaterAllowed: model.repeaterAllowed !== false,
                repeaterPoints: Math.max(0, Number(model.repeaterPoints) || 0),
                tiersEnabled: tiersEnabled,
                categoriesEnabled: categoriesEnabled,
                categories: categories,
                overlayFontFamily: overlayFontFamily,
                overlayFontSize: overlayFontSize,
                zoneThresholds: {
                    home: numOrNull(model.zoneThresholds && model.zoneThresholds.home),
                    eu: numOrNull(model.zoneThresholds && model.zoneThresholds.eu),
                    dx: numOrNull(model.zoneThresholds && model.zoneThresholds.dx)
                },
                homeCountry: (model.homeCountry || '').toUpperCase(),
                qslSampleCount: Math.max(0, Number(model.qslSampleCount) || 0),
                pricing: {
                    pdfFee: Math.max(0, Number(model.pricing && model.pricing.pdfFee) || 0),
                    physicalFee: Math.max(0, Number(model.pricing && model.pricing.physicalFee) || 0),
                    currency: (model.pricing && model.pricing.currency) || 'EUR'
                },
                physicalOfferEnabled: !!model.physicalOfferEnabled,
                autoApprove: autoApprove,
                paymentMethods: paymentMethods,
                bankTransferDetails: {
                    accountName: (model.bankTransferDetails && model.bankTransferDetails.accountName) || '',
                    iban: (model.bankTransferDetails && model.bankTransferDetails.iban) || '',
                    note: (model.bankTransferDetails && model.bankTransferDetails.note) || ''
                },
                overlayFields: overlayFields,
                status: status,
                updated: new Date()
            };

            set.type = type;
            set.challenge = challenge;

            // For the 'challenge' type, we force the STANDARD-only fields (rule engine
            // settings) to their default/empty value -- the same pattern as
            // tiersEnabled already being forced to false in checklist mode today.
            // This way, a document that was switched from standard to challenge
            // doesn't retain any meaningless/misleading rule-engine data either.
            if (type === 'challenge') {
                set.ruleMode = 'checklist';
                set.matchRules = [];
                set.duplicatePolicy = 'per_band_mode';
                set.allowedBands = [];
                set.repeaterAllowed = true;
                set.repeaterPoints = 0;
                set.tiersEnabled = false;
                set.categoriesEnabled = false;
                set.categories = [];
                set.zoneThresholds = { home: null, eu: null, dx: null };
                set.qslSampleCount = 0;
            }

            if (model.id) {
                let update = await MDB.updateOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(model.id) }, set);

                if (isDbError(update)) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                    return;
                }

                FUNC.logger($, `Diplomas/Diplomas save (update): ${model.id} -> ${set.name}`);
                $.callback({ success: true, id: model.id });
                return;
            }

            set.serialStart = Math.max(1, Number(model.serialStart) || DEFAULT_SERIAL_START);
            set.serialCounter = set.serialStart;
            set.blankImage = null;
            set.createdBy = $.user._id;
            set.created = new Date();

            let insert = await MDB.insertOne(process.env.MONGODB_DB_NAME, 'diplomas', set);

            if (isDbError(insert) || !insert.insertedId) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            FUNC.logger($, `Diplomas/Diplomas save (create): ${insert.insertedId} -> ${set.name}`);
            $.callback({ success: true, id: String(insert.insertedId) });
        }
    });
});

function isDbError(result) {
    return Array.isArray(result) && result[0] != null && result[0].error != null;
}

// Superadmin sees/manages everything; a plain manager only the diploma assigned
// TO THEM (managerId === user._id) — see the same rule in the query/get/previewRender/delete/save
// actions. A missing `diploma` (non-existent/deleted record) also counts as a
// rejection for non-sa, so that no information can be gained about its existence
// either.
function isDiplomaManagerOf(user, diploma) {
    if (!user)
        return false;

    if (user.sa)
        return true;

    return !!(diploma && diploma.managerId && diploma.managerId === user._id);
}

function numOrNull(value) {
    return value === '' || value == null ? null : Number(value);
}

// To display the diploma-level responsible manager (managerId), resolves the
// corresponding user's email/callsign data, and attaches it as a `managerInfo` field
// to every diploma object in the `diplomas` array (modifies in place). INTENTIONALLY
// NOT a denormalized/stored field on the diploma document — only `managerId`
// (string, users._id) is saved — so that the diploma's and the user's data don't
// drift apart if someone later changes their callsign/email. Both the `query` and the
// `get` action call this (for get, with a 1-element array).
async function attachManagerInfo(diplomas) {
    let ids = diplomas.map(d => d.managerId).filter(id => id);

    if (!ids.length)
        return;

    let managers = await MDB.find(process.env.MONGODB_DB_NAME, 'users', { _id: { $in: ids.map(id => MDB.ObjectID(id)) } }, {
        projection: { email: 1, callsign: 1 }
    });

    if (isDbError(managers))
        return;

    let byId = {};
    for (let i = 0, n = managers.length; i < n; i++) {
        byId[String(managers[i]._id)] = managers[i];
    }

    for (let i = 0, n = diplomas.length; i < n; i++) {
        let manager = diplomas[i].managerId && byId[diplomas[i].managerId];
        diplomas[i].managerInfo = manager ? { email: manager.email, callsign: manager.callsign } : null;
    }
}

// Returns the first invalid regex pattern (as a string), or null if every
// 'regex'-operator rule's pattern is a valid regular expression.
function findInvalidRegexRule(rules) {
    if (!Array.isArray(rules))
        return null;

    for (let i = 0, n = rules.length; i < n; i++) {
        let rule = rules[i];

        if (!rule || rule.operator !== 'regex')
            continue;

        let pattern = String(rule.value || '').trim();

        if (!pattern)
            continue;

        try {
            new RegExp(pattern);
        } catch (e) {
            return pattern;
        }
    }

    return null;
}

// Whether a single string is a valid regex — needed for the challenge diploma's
// standalone, global `commentFilterRegex` field (see sanitizeChallenge), which
// will run as `new RegExp(pattern, 'i')` in modules/challenge-engine.js's
// passesFilters(), against the uploaded log's COMMENT field.
function isValidRegexString(pattern) {
    try {
        new RegExp(pattern, 'i');
        return true;
    } catch (e) {
        return false;
    }
}

// Returns the first invalid group name for a given field (e.g. 'mode' ->
// ADIF_MODES.GROUP_NAMES, 'band' -> ADIF_BANDS.GROUP_NAMES), or null if
// every 'group'-operator rule for this field has a value that is an existing group.
function findInvalidGroupRule(rules, field, groupNames) {
    if (!Array.isArray(rules))
        return null;

    for (let i = 0, n = rules.length; i < n; i++) {
        let rule = rules[i];

        if (!rule || rule.field !== field || rule.operator !== 'group')
            continue;

        let group = String(rule.value || '').trim().toUpperCase();

        if (group && groupNames.indexOf(group) === -1)
            return group;
    }

    return null;
}

// Sanitizes the diploma-level "allowed bands" list — see the comment above
// `set.allowedBands` in the `save` action about how it differs from the matchRules
// 'band' field. Lowercased (ADIF convention, like the matchRules 'band' values),
// with duplicate filtering, unnamed/empty elements dropped. We do NOT strictly validate
// against the ADIF_BANDS.ALL list — same principle as for the matchRules 'band' field:
// the list only contains the common bands, the manager is free to enter something else too.
function sanitizeAllowedBands(bands) {
    if (!Array.isArray(bands))
        return [];

    let output = [];
    let used = {};

    for (let i = 0, n = bands.length; i < n; i++) {
        let band = String(bands[i] || '').trim().toLowerCase();

        if (!band || used[band])
            continue;

        used[band] = true;
        output.push(band);
    }

    return output;
}

// Same as sanitizeAllowedBands, but for operating modes (uppercased, per the ADIF
// MODE convention — see the matchRules 'mode' field). Currently needed for the
// challenge diploma type's "allowed modes" filter (see sanitizeChallenge) —
// for the standard type, the matchRules 'mode' field plays the same role, so it's
// not needed separately there.
function sanitizeAllowedModes(modes) {
    if (!Array.isArray(modes))
        return [];

    let output = [];
    let used = {};

    for (let i = 0, n = modes.length; i < n; i++) {
        let mode = String(modes[i] || '').trim().toUpperCase();

        if (!mode || used[mode])
            continue;

        used[mode] = true;
        output.push(mode);
    }

    return output;
}

function sanitizeMatchRules(rules) {
    if (!Array.isArray(rules))
        return [];

    let output = [];

    for (let i = 0, n = rules.length; i < n; i++) {
        let rule = rules[i];

        if (!rule || RULE_FIELDS.indexOf(rule.field) === -1 || RULE_OPERATORS.indexOf(rule.operator) === -1)
            continue;

        let value = rule.value;
        if (rule.operator === 'in_list') {
            value = Array.isArray(value) ? value : String(value || '').split(',').map(v => v.trim()).filter(v => v);
        } else {
            value = String(value || '').trim();
        }

        // We store mode values (concrete mode OR group name) uniformly uppercased,
        // because the ADIF MODE field is also defined this way, and it saves the
        // future rule engine (step 6) a case-insensitive comparison.
        if (rule.field === 'mode') {
            value = Array.isArray(value) ? value.map(v => v.toUpperCase()) : value.toUpperCase();
        }

        // We store band values (concrete band, e.g. "80M") uniformly lowercased
        // ("80m") — the ADIF BAND field is also defined this way, while the group name (e.g. "VHF")
        // is uppercased (the same convention as for mode groups).
        if (rule.field === 'band') {
            if (rule.operator === 'group') {
                value = String(value).toUpperCase();
            } else {
                value = Array.isArray(value) ? value.map(v => v.toLowerCase()) : value.toLowerCase();
            }
        }

        if (!value || (Array.isArray(value) && !value.length))
            continue;

        output.push({
            field: rule.field,
            operator: rule.operator,
            value: value,
            points: Math.max(0, Number(rule.points) || 0),
            label: (rule.label || '').trim()
        });
    }

    return output;
}

// Produces an accent-free, hyphenated key from a free-text label (e.g.
// a label with accented letters has its accents stripped before slugifying),
// so that categories/tiers have a stable, machine
// identifier (this will be used by step 6's rule engine and the
// submissions collection to tie a submission to a given category+tier
// combination).
function slugify(text) {
    return String(text || '').trim().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '') || 'item';
}

// Sanitizes a tier ladder within a category (e.g. Bronze/Silver/Gold): drops
// unnamed rows, doesn't allow the score below 0. `minPoints` is NOT a
// number but `{home, eu, dx}` — the user realized that if a diploma has a
// different minimum per zone (see the diploma-level `zoneThresholds`), then a given
// tier's threshold can also differ per zone (e.g. it's harder for a DX
// station to gather the same number of points as a home station). At the end we
// sort in ascending order by the `home` value — assuming the manager
// fills in the tiers in a CONSISTENTLY ascending order in all three zones
// (e.g. Bronze.home < Silver.home < Gold.home, and likewise for EU/DX) —
// so that the rule engine can later simply pick, based on the `home` field, the
// highest tier whose minPoints[zone] <= the achieved score.
function sanitizeTiers(tiers) {
    if (!Array.isArray(tiers))
        return [];

    let output = [];
    let usedKeys = {};

    for (let i = 0, n = tiers.length; i < n; i++) {
        let tier = tiers[i];

        if (!tier)
            continue;

        let label = (tier.label || '').trim();

        if (!label)
            continue;

        let key = slugify(label);
        let counter = 2;
        while (usedKeys[key]) {
            key = slugify(label) + '-' + counter;
            counter++;
        }
        usedKeys[key] = true;

        let minPoints = tier.minPoints || {};

        output.push({
            key: key,
            label: label,
            minPoints: {
                home: Math.max(0, Number(minPoints.home) || 0),
                eu: Math.max(0, Number(minPoints.eu) || 0),
                dx: Math.max(0, Number(minPoints.dx) || 0)
            }
        });
    }

    output.sort((a, b) => a.minPoints.home - b.minPoints.home);
    return output;
}

// The category's "name" is NOT free text (this used to be a separate input, but the
// user pointed out that it's redundant and confusing — it's unclear what the
// relationship is between a freely typed name and the mode filter). Instead the
// category name ALWAYS comes from the mode filter — the manager only picks the
// filter, the displayed label automatically follows it.
const CATEGORY_LABELS = { CW: 'CW', PHONE: 'Phone', DIGITAL: 'Digital', IMAGE: 'Image' };
function categoryLabelFor(modeFilter) {
    return modeFilter ? (CATEGORY_LABELS[modeFilter] || modeFilter) : 'Mixed';
}

// If tiers are not enabled, we store an empty array. If they are
// enabled but per-mode categories are not, we trim the input to 1 element
// (implicit "Mixed" category, without modeFilter) — this way the rule engine
// can always uniformly iterate over the `categories` array, regardless of whether the
// manager used a per-mode breakdown. A mode filter (e.g. "CW")
// can only appear once — a repeated category (e.g. two "CW" rows) is dropped,
// because the name would have to match anyway, which would produce a pointless duplicate.
function sanitizeCategories(categories, tiersEnabled, categoriesEnabled) {
    if (!tiersEnabled || !Array.isArray(categories))
        return [];

    let source = categoriesEnabled ? categories : categories.slice(0, 1);
    let output = [];
    let usedModeFilters = {};

    for (let i = 0, n = source.length; i < n; i++) {
        let category = source[i];

        if (!category)
            continue;

        let tiers = sanitizeTiers(category.tiers);

        if (!tiers.length)
            continue;

        let modeFilter = categoriesEnabled ? String(category.modeFilter || '').trim().toUpperCase() : '';
        if (CATEGORY_MODE_FILTERS.indexOf(modeFilter) === -1)
            modeFilter = null;

        let dedupeKey = modeFilter || 'MIXED';

        if (usedModeFilters[dedupeKey])
            continue;

        usedModeFilters[dedupeKey] = true;

        let label = categoryLabelFor(modeFilter);

        output.push({
            key: slugify(label),
            label: label,
            modeFilter: modeFilter,
            tiers: tiers
        });
    }

    return output;
}

// Sanitizes one row of the target pool: `value` is required (normalized according
// to targetField -- uppercased for callsign/callsign-prefix, like the
// matchRules 'mode' field -- see modules/challenge-engine.js isMatch()'s
// 'call'/'country' branch, both compare against the callsign in uppercase),
// `label` is an optional free display text. A duplicate (normalized)
// `value` is only included once, empty rows are dropped.
function sanitizeChallengePool(pool, targetField) {
    if (!Array.isArray(pool))
        return [];

    let output = [];
    let used = {};

    for (let i = 0, n = pool.length; i < n; i++) {
        let item = pool[i];

        if (!item)
            continue;

        let value = String(item.value || '').trim();

        if (!value)
            continue;

        if (targetField === 'call' || targetField === 'country')
            value = value.toUpperCase();

        let dedupeKey = value.toUpperCase();

        if (used[dedupeKey])
            continue;

        used[dedupeKey] = true;

        output.push({ value: value, label: String(item.label || '').trim() });
    }

    return output;
}

// Sanitizes the challenge-specific settings -- only called for a 'challenge'-type
// diploma (see save action); for a 'standard' type, the diploma document's
// `challenge` field is always empty `{}`, so it doesn't retain meaningless
// data. IMPORTANT SCOPE: this only sanitizes the ADMIN CONFIGURATION -- the
// actual drawing/round-matching logic is a LATER step (see the comment
// above CHALLENGE_TARGET_FIELDS).
function sanitizeChallenge(challenge) {
    challenge = challenge || {};

    let targetField = CHALLENGE_TARGET_FIELDS.indexOf(challenge.targetField) !== -1 ? challenge.targetField : null;
    let drawPerRound = Math.max(1, Math.floor(Number(challenge.drawPerRound)) || 1);
    let totalRounds = Math.max(1, Math.floor(Number(challenge.totalRounds)) || 1);
    let allowRepeatAcrossRounds = !!challenge.allowRepeatAcrossRounds;
    let roundDeadlineDays = Number(challenge.roundDeadlineDays) > 0 ? Math.floor(Number(challenge.roundDeadlineDays)) : null;
    let qslSampleCount = Math.max(0, Number(challenge.qslSampleCount) || 0);
    // STANDALONE, GLOBAL condition (per user request, 2026-09-18) — a single
    // regex pattern, COMPLETELY INDEPENDENT from the targetField/pool-based
    // target matching, that the log's COMMENT field must also satisfy (AND
    // relation, see modules/challenge-engine.js's passesFilters()), before
    // a QSO can be considered for any target at all. This is needed
    // independently of the target pool's own value because e.g.
    // targetField:'country' (callsign prefix, see sanitizeChallengePool) AND
    // a DMR talkgroup number can be required SIMULTANEOUSLY: the pool lists the
    // HA/OE callsign prefixes, while commentFilterRegex might be "TG[0-9]{3,4}"
    // — a QSO only counts if BOTH are satisfied.
    let commentFilterRegex = String(challenge.commentFilterRegex || '').trim();

    return {
        targetField: targetField,
        targetPool: sanitizeChallengePool(challenge.targetPool, targetField),
        commentFilterRegex: commentFilterRegex,
        drawPerRound: drawPerRound,
        totalRounds: totalRounds,
        allowRepeatAcrossRounds: allowRepeatAcrossRounds,
        roundDeadlineDays: roundDeadlineDays,
        qslSampleCount: qslSampleCount,
        // Allowed bands/modes — the same VALIDITY filter principle as the
        // standard diploma-level `allowedBands` (see the comment above the `save`
        // action): empty array = no restriction, otherwise in a round only a
        // QSO made on one of the bands/modes listed here is valid. For the standard
        // type, the matchRules 'mode'/'band' field (and the diploma-level
        // allowedBands) serve this purpose, but the challenge type does NOT use matchRules,
        // so it gets its own filter here, inside the challenge object.
        allowedBands: sanitizeAllowedBands(challenge.allowedBands),
        allowedModes: sanitizeAllowedModes(challenge.allowedModes)
    };
}

function sanitizeOverlayFields(fields) {
    if (!Array.isArray(fields))
        return [];

    let output = [];

    for (let i = 0, n = fields.length; i < n; i++) {
        let field = fields[i];

        if (!field || OVERLAY_KEYS.indexOf(field.key) === -1)
            continue;

        output.push({
            key: field.key,
            top: Math.min(100, Math.max(0, Number(field.top) || 0)),
            left: Math.min(100, Math.max(0, Number(field.left) || 0)),
            align: ['left', 'center', 'right'].indexOf(field.align) !== -1 ? field.align : 'center'
        });
    }

    return output;
}
