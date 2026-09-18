// diplomas-public.js — the diploma list and detail page accessible to radio
// amateurs (even without registration): only `status:'active'` diplomas, with a
// read-only (not admin-editable) display of the rule set + a WATERMARKED
// preview of the blank image. Fully server-side rendered, no
// dedicated JS/API — the
// diploma list/detail is static content, it doesn't need client-side
// fetch (unlike the admin pages, which work like an SPA).
//
// The resource templates marked '{0}'/'{field}'/'{value}' are substituted here, in the
// controller JS, using RESOURCE() (NOT through the view's '@(#key)' engine,
// which doesn't support parameters) — the same pattern as
// email sending (see the "Sending email" section of CLAUDE.md).

// Group labels (the 'group' operator of per-mode scoring) — intentionally
// English words, just like schemas/diplomas/diplomas.js's CATEGORY_LABELS
// too (the category labels are also always these, regardless of language).
const GROUP_LABELS = { CW: 'CW', PHONE: 'Phone', DIGITAL: 'Digital', IMAGE: 'Image' };
const BAND_GROUP_LABELS = { HF: 'HF', VHF: 'VHF', UHF: 'UHF' };

// "Owned" indicator on the diploma list (per user request) — based on the
// `submissions` schema's (schemas/submissions/submissions.js `decide` action)
// state machine, `approved`/`paid`/`completed` ALL mean that the certificate has
// actually been issued (the PDF has already been generated, downloadable):
// `approved` is the FINAL STATE for free certificates (nothing to pay), `paid`
// is the FINAL STATE for paid, PDF-only delivery — `completed` is created
// EXCLUSIVELY for physically (printed/mailed) delivered certificates, when the
// manager manually marks it "completed". So all three count as "OWNED",
// NOT just `completed` — originally only `completed` was included here, but that
// left out exactly the most common case (free/PDF-paid certificate),
// see the user feedback. `awaiting_payment` (not yet paid) REMAINS "in progress" —
// together with the submitted/QSL/under-review statuses, this indicates the
// process hasn't concluded yet.
const OWNED_STATUSES = ['approved', 'paid', 'completed'];
const IN_PROGRESS_STATUSES = ['submitted', 'awaiting_qsl', 'pending_review', 'awaiting_payment'];

// Statistics page (per user request): a list of who actually earned a diploma,
// with a summary at the top by region (Home/EU/DX), and a paginated
// callsign list below.
const STATS_PAGE_SIZE = 20;

exports.install = function () {
    ROUTE('GET /diplomas', view_list);
    ROUTE('GET /diplomas/{id}', view_detail);
    ROUTE('GET /diplomas/{id}/stats', view_stats);
};

async function view_list() {
    let self = this;
    let language = self.language;

    let diplomas = await MDB.find(process.env.MONGODB_DB_NAME, 'diplomas', { status: 'active' }, {
        projection: { name: 1, type: 1, deadlineType: 1, deadlineDate: 1, pricing: 1, managerId: 1, blankImage: 1 }
    }, { created: -1 });

    if (isDbError(diplomas))
        diplomas = [];

    await attachManagerInfo(diplomas);

    // Filtering by type (?type=standard|challenge, query parameter) — WITHOUT
    // filtering every active diploma is shown. The server-side `MDB.find` intentionally
    // doesn't filter directly in the query, because existing diplomas (from before
    // the `type` field was introduced) are missing the field -- here, in JS, it's simpler
    // to treat it as `d.type || 'standard'` than with a Mongo `$or` condition.
    // A simple, JS-free (link-based, page-reload) filter, in the same
    // spirit as this page being fully server-side rendered anyway.
    let typeFilter = self.query.type === 'standard' || self.query.type === 'challenge' ? self.query.type : 'all';

    if (typeFilter !== 'all') {
        diplomas = diplomas.filter(d => (d.type || 'standard') === typeFilter);
    }

    let ownedStatusById = self.user ? await loadOwnedStatuses(diplomas, self.user) : {};

    // "Only what I haven't earned yet" filter (?unowned=1, per user request)
    // — only makes sense for a logged-in user (ownedStatus is also only
    // computed then), so the checkbox/button also only appears in the view then.
    // It hides both "owned" (see OWNED_STATUSES above) AND expired (`stampType:
    // 'expired'`, see buildListItem) cards — the latter per
    // user request: a diploma with an expired deadline can NEVER
    // be earned anymore, so it doesn't belong on the "still earnable" list. Items with
    // `inprogress` status (already submitted, but not yet reviewed/paid)
    // REMAIN, because those haven't been "earned yet" either.
    let unownedFilter = !!(self.user && self.query.unowned === '1');

    let listItems = diplomas.map(d => buildListItem(d, language, ownedStatusById[String(d._id)]));

    if (unownedFilter) {
        listItems = listItems.filter(item => !item.stampType);
    }

    listItems.sort(compareListItems);

    self.repository.diplomas = listItems;
    self.repository.typeFilter = typeFilter;
    self.repository.unownedFilter = unownedFilter;
    self.repository.showUnownedFilter = !!self.user;
    self.repository.filterUrls = {
        all: buildListUrl('all', unownedFilter),
        standard: buildListUrl('standard', unownedFilter),
        challenge: buildListUrl('challenge', unownedFilter),
        unownedToggle: buildListUrl(typeFilter, !unownedFilter)
    };
    self.repository.emptyMessage = RESOURCE(language, (typeFilter === 'all' && !unownedFilter) ? 'diplomas.public.list.empty' : 'diplomas.public.list.empty.filtered');
    self.view('list');
}

async function view_detail(id) {
    let self = this;
    let language = self.language;
    let diploma;

    try {
        diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(id), status: 'active' });
    } catch (e) {
        self.throw404();
        return;
    }

    if (isDbError(diploma) || !diploma) {
        self.throw404();
        return;
    }

    await attachManagerInfo([diploma]);

    let countryName = diploma.homeCountry ? COUNTRIES.name(diploma.homeCountry, language) : '';

    self.repository.diploma = diploma;
    self.repository.hasImage = !!(diploma.blankImage && diploma.blankImage.watermarkedKey);

    // The table row headers use the resource keys ALREADY known from the admin
    // editor (diplomas.deadline.*, diplomas.fee.*.label,
    // diplomas.manager.*, diplomas.payment.*) — there's no point adding a separate "public"
    // duplicate for the same concept, the view just puts the raw value
    // next to the ready-made header.
    self.repository.managerValue = diploma.managerInfo
        ? (diploma.managerInfo.callsign || diploma.managerInfo.email)
        : RESOURCE(language, 'diplomas.manager.none');

    self.repository.deadlineValue = diploma.deadlineType === 'deadline' && diploma.deadlineDate
        ? new Date(diploma.deadlineDate).toLocaleDateString(language)
        : RESOURCE(language, 'diplomas.deadline.continuous');

    self.repository.feePdfValue = diploma.pricing && diploma.pricing.pdfFee > 0
        ? diploma.pricing.pdfFee + ' ' + diploma.pricing.currency
        : RESOURCE(language, 'diplomas.public.list.fee.free');

    self.repository.feePhysicalValue = diploma.physicalOfferEnabled
        ? (diploma.pricing.physicalFee || 0) + ' ' + diploma.pricing.currency
        : null;

    self.repository.paymentMethods = diploma.paymentMethods || [];

    // We intentionally do NOT reveal the exact sample count (qslSampleCount)
    // on the public page — only that the applicant can be sampled at all —
    // so that it can't be "gamed" (e.g. only preparing as many QSLs as
    // they're sure to be asked for).
    self.repository.qslText = diploma.qslSampleCount > 0
        ? RESOURCE(language, 'diplomas.public.detail.qsl.text')
        : null;

    self.repository.duplicateText = RESOURCE(language, 'diplomas.duplicate.' + diploma.duplicatePolicy) || '';

    // Only shown if the manager actually restricted the bands (empty
    // list = no restriction, nothing to say) — see the schema's `allowedBands`
    // comment: this is INDEPENDENT of whether there's a matchRules rule scoring by band.
    // For the challenge type, the diploma-level `allowedBands` is always empty (see the save
    // action), there `challenge.allowedBands` is authoritative — the same sentence template
    // works for it, only the source array selection is type-dependent.
    let allowedBands = diploma.type === 'challenge' ? ((diploma.challenge || {}).allowedBands || []) : (diploma.allowedBands || []);
    self.repository.allowedBandsText = allowedBands.length
        ? RESOURCE(language, 'diplomas.public.detail.allowedbands.text').replace('{0}', allowedBands.join(', '))
        : null;

    // Mode restriction is currently only interpreted for the challenge diploma type
    // (for the standard type, the matchRules 'mode' field serves this, there's no
    // diploma-level, scoring-independent filter for it there).
    self.repository.challengeAllowedModesText = diploma.type === 'challenge' && (diploma.challenge || {}).allowedModes && diploma.challenge.allowedModes.length
        ? RESOURCE(language, 'diplomas.public.detail.challenge.allowedmodes.text').replace('{0}', diploma.challenge.allowedModes.join(', '))
        : null;

    // We only show anything if there's something meaningful to say: if the repeater
    // is explicitly FORBIDDEN, or if there's a separate (non-zero) point value for it —
    // we intentionally do not display the "allowed, no special rule" default state
    // (the majority of diplomas), so there isn't unnecessary noise on most
    // diploma pages.
    self.repository.repeaterText = diploma.repeaterAllowed === false
        ? RESOURCE(language, 'diplomas.public.detail.repeater.notallowed')
        : (diploma.repeaterPoints > 0
            ? RESOURCE(language, 'diplomas.public.detail.repeater.allowed.points').replace('{0}', diploma.repeaterPoints)
            : null);

    self.repository.rulesIntro = diploma.ruleMode === 'checklist'
        ? RESOURCE(language, 'diplomas.public.detail.rules.checklist.intro')
        : RESOURCE(language, 'diplomas.public.detail.rules.points.intro');

    self.repository.rules = (diploma.matchRules || []).map(rule => describeMatchRule(rule, language, diploma.ruleMode));

    // Challenge diploma (application -> per-round drawing from a target pool,
    // see schemas/diplomas/diplomas.js) -- the standard checklist/points
    // rule table doesn't make sense here (matchRules is always empty for the challenge
    // type), so a separate, short summary is shown instead (see
    // views/diplomas-public/detail.html). The actual application isn't
    // an available feature yet -- the same "coming soon" CTA applies to it too.
    if (diploma.type === 'challenge') {
        let challenge = diploma.challenge || {};
        self.repository.challengeInfo = {
            targetFieldLabel: RESOURCE(language, 'diplomas.challenge.targetfield.' + (challenge.targetField || 'call')),
            drawPerRound: challenge.drawPerRound || 1,
            totalRounds: challenge.totalRounds || 1,
            roundDeadlineDays: challenge.roundDeadlineDays || null,
            poolSize: (challenge.targetPool || []).length
        };
    } else {
        self.repository.challengeInfo = null;
    }

    // The per-tier/per-category zone thresholds are ONLY relevant if
    // the diploma uses tiers (tiersEnabled) — otherwise the diploma-level
    // plain zoneThresholds is authoritative (only interpreted in points mode).
    self.repository.tiersEnabled = !!diploma.tiersEnabled;
    self.repository.categories = (diploma.categories || []).map(describeCategory);

    self.repository.showFlatZones = diploma.ruleMode === 'points' && !diploma.tiersEnabled;
    self.repository.zoneHomeLabel = RESOURCE(language, 'diplomas.zone.home') + (countryName ? ' (' + countryName + ')' : '');

    // We intentionally convert this to a string here, in the controller (not in the
    // view with an `@{... == null ? '' : ...}` ternary) — the Total.js view engine's
    // `view_is_assign()` helper (node_modules/total4/internal.js) mistakenly
    // detects the `repository.xxx == ...` pattern as an ASSIGNMENT (it can't
    // distinguish the `==` comparison's first `=` character from a real
    // `=` assignment), so an expression like `@{repository....== null ? a : b}`
    // ALWAYS renders an empty string, regardless of the actual condition —
    // this is what caused the zone thresholds not to show up before
    // (see the loop-variable-based `s`/`c`/`q` ternaries elsewhere in the
    // codebase, WITHOUT a callsign — THOSE work fine, because they don't start with `repository`).
    let zoneThresholds = diploma.zoneThresholds || {};
    self.repository.zoneHomeValue = zoneThresholds.home == null ? '' : zoneThresholds.home;
    self.repository.zoneEuValue = zoneThresholds.eu == null ? '' : zoneThresholds.eu;
    self.repository.zoneDxValue = zoneThresholds.dx == null ? '' : zoneThresholds.dx;

    // Submission CTA state (step 6, or for challenge, the challenge-application
    // runtime, see controllers/submissions.js) — relevant for both diploma
    // types: resolveSubmitCtaState is type-independent (it only looks at the diploma-level
    // determinism/deadline and the blocking submission), the view decides based on
    // this whether to show a standard upload link or a
    // challenge application button on the "submit" branch.
    if (self.user) {
        self.repository.ctaState = await resolveSubmitCtaState(diploma, self.user);
    }

    self.view('detail');
}

// Statistics page: who has actually earned this diploma (see
// OWNED_STATUSES). Per-region (Home/EU/DX) summary from the FULL (not
// paginated) dataset, with the paginated callsign list below (`?page=N`,
// INTENTIONALLY not the JS/fetch-based admin-style pagination, because this page is also
// server-side rendered, like the other diplomas-public routes).
async function view_stats(id) {
    let self = this;
    let language = self.language;
    let diploma;

    try {
        diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(id), status: 'active' });
    } catch (e) {
        self.throw404();
        return;
    }

    if (isDbError(diploma) || !diploma) {
        self.throw404();
        return;
    }

    let page = Number(self.query.page) || 0;
    let max = STATS_PAGE_SIZE;

    // The FULL (not paginated) dataset is needed for the per-region summary —
    // for this, userId is enough, the zone is computed LIVE based on the applicant's
    // CURRENT country (see classifyZone below), NOT from the stored
    // `autoCheckDetails.zone` at submission time: the latter only exists at all for
    // `ruleMode:'points'` diplomas (see modules/rule-engine.js's evaluateChecklist,
    // which does NOT write a zone), so with this solution we can also show a
    // per-region breakdown for checklist-mode diplomas.
    let allOwned = await MDB.find(process.env.MONGODB_DB_NAME, 'submissions', {
        diplomaId: id,
        status: { $in: OWNED_STATUSES }
    }, { projection: { userId: 1 } });

    if (isDbError(allOwned))
        allOwned = [];

    let zoneCounts = await countByZone(allOwned, diploma.homeCountry);

    let result = await MDB.find(process.env.MONGODB_DB_NAME, 'submissions', {
        diplomaId: id,
        status: { $in: OWNED_STATUSES }
    }, {
        projection: { userId: 1, totalPoints: 1, autoCheckDetails: 1, serialNumber: 1, reviewedAt: 1 },
        skip: page * max
    }, { serialNumber: 1 }, max, true);

    if (isDbError(result))
        result = { countFull: 0, data: [] };

    await attachApplicantInfo(result.data);

    let maxPage = Math.max(0, Math.ceil(result.countFull / max) - 1);

    self.repository.diploma = diploma;
    self.repository.statsTitle = RESOURCE(language, 'diplomas.public.stats.title').replace('{0}', diploma.name);
    self.repository.zoneCounts = zoneCounts;
    self.repository.totalOwned = allOwned.length;
    self.repository.showPoints = diploma.ruleMode === 'points';
    self.repository.showTier = diploma.ruleMode === 'points' && !!diploma.tiersEnabled;
    self.repository.rows = result.data.map(s => buildStatsRow(s, diploma, language));
    self.repository.hasPrev = page > 0;
    self.repository.hasNext = page < maxPage;
    self.repository.prevUrl = `/diplomas/${id}/stats?page=${page - 1}`;
    self.repository.nextUrl = `/diplomas/${id}/stats?page=${page + 1}`;
    self.repository.pageText = RESOURCE(language, 'diplomas.public.stats.pagination.page').replace('{0}', page + 1).replace('{1}', maxPage + 1);

    self.view('stats');
}

// Classifies a country code into Home/EU/DX relative to the diploma's `homeCountry`
// — a LIVE classification (based on the user's CURRENT `country` field), intentionally
// a SEPARATE copy of modules/rule-engine.js's `determineZone()` (that one is
// module-private, not exported, AND classifies the FROZEN country at
// submission time — here the current, up-to-date classification is needed for a
// statistical summary, these two purposes intentionally differ).
function classifyZone(applicantCountry, homeCountry) {
    let country = String(applicantCountry || '').toUpperCase();
    let home = String(homeCountry || '').toUpperCase();

    if (home && country === home)
        return 'home';

    return COUNTRIES.isEU(country) ? 'eu' : 'dx';
}

// Returns the Home/EU/DX summary at the top of the statistics page — resolves
// the involved userIds to countries with a single batch `$in` query, then
// tallies it in JS (no need for a Mongo aggregation pipeline here, the
// count rarely exceeds a few hundred per diploma).
async function countByZone(submissions, homeCountry) {
    let counts = { home: 0, eu: 0, dx: 0 };

    if (!submissions.length)
        return counts;

    let ids = submissions.map(s => s.userId).filter(id => id);
    let users = await MDB.find(process.env.MONGODB_DB_NAME, 'users', { _id: { $in: ids.map(id => MDB.ObjectID(id)) } }, {
        projection: { country: 1 }
    });

    if (isDbError(users))
        return counts;

    let countryById = {};
    for (let i = 0, n = users.length; i < n; i++) {
        countryById[String(users[i]._id)] = users[i].country;
    }

    for (let i = 0, n = submissions.length; i < n; i++) {
        let zone = classifyZone(countryById[submissions[i].userId], homeCountry);
        counts[zone]++;
    }

    return counts;
}

// Attaches the applicant's callsign/country to the submissions belonging to the
// paginated list's current page — the same batch `$in` join pattern as
// controllers/submissions.js's attachApplicantInfo() (intentionally a separate
// copy, see attachManagerInfo()'s comment above about the same thing).
async function attachApplicantInfo(submissions) {
    let ids = submissions.map(s => s.userId).filter(id => id);

    if (!ids.length)
        return;

    let users = await MDB.find(process.env.MONGODB_DB_NAME, 'users', { _id: { $in: ids.map(id => MDB.ObjectID(id)) } }, {
        projection: { callsign: 1, country: 1 }
    });

    if (isDbError(users))
        return;

    let byId = {};
    for (let i = 0, n = users.length; i < n; i++) {
        byId[String(users[i]._id)] = users[i];
    }

    for (let i = 0, n = submissions.length; i < n; i++) {
        submissions[i].applicant = byId[submissions[i].userId] || null;
    }
}

// The display-ready form of a statistics list row. The score is the FINAL
// (after any possible manual correction) `submission.totalPoints`, BUT the
// category/tier label comes from the same `autoCheckDetails.categories`
// snapshot taken at submission time as the actually issued certificate's (see
// schemas/submissions/submissions.js buildCertificateFieldValues()) — this is
// INTENTIONAL: the statistics should show the tier that was actually PRINTED, not a
// value recalculated afterwards from the corrected score (which might differ from it).
function buildStatsRow(submission, diploma, language) {
    let applicant = submission.applicant;
    let zone = classifyZone(applicant && applicant.country, diploma.homeCountry);

    let row = {
        serialNumber: submission.serialNumber,
        callsign: applicant ? applicant.callsign : '—',
        zoneLabel: RESOURCE(language, 'diplomas.zone.' + zone),
        dateText: submission.reviewedAt ? new Date(submission.reviewedAt).toLocaleDateString(language) : '',
        points: null,
        tierLabel: null
    };

    let details = submission.autoCheckDetails;

    if (details && details.mode === 'points') {
        row.points = submission.totalPoints;

        if (Array.isArray(details.categories)) {
            let achieved = details.categories.filter(c => c.achievedTier).sort((a, b) => b.points - a.points);

            if (achieved.length)
                row.tierLabel = achieved[0].label + ': ' + achieved[0].achievedTier.label;
        }
    }

    return row;
}

// See the comment above — returns which branch of the "Application" section
// the view should show: 'expired' (deadline passed), 'existing' (already has a blocking
// submission, see controllers/submissions.js's NON_BLOCKING_STATUSES — this
// rule is intentionally duplicated here, so the public page also consistently
// reflects it), or 'submit' (the submit button can appear).
async function resolveSubmitCtaState(diploma, user) {
    if (diploma.deadlineType === 'deadline' && diploma.deadlineDate && new Date(diploma.deadlineDate) < new Date())
        return { type: 'expired' };

    let blocking = await MDB.findOne(process.env.MONGODB_DB_NAME, 'submissions', {
        diplomaId: String(diploma._id),
        userId: user._id,
        status: { $nin: ['rejected_auto', 'rejected'] }
    });

    if (!isDbError(blocking) && blocking)
        return { type: 'existing', submissionId: blocking._id };

    return { type: 'submit' };
}

// Builds the URL for the type- and "not-yet-earned"-filter buttons/links
// — both filters should be combinable SIMULTANEOUSLY, preserving each other (e.g.
// clicking the type button should NOT lose the "only not-yet-earned" checkbox, and
// vice versa), in the same JS-free, link-based spirit as the
// existing type filter.
function buildListUrl(type, unowned) {
    let params = [];

    if (type !== 'all')
        params.push('type=' + type);

    if (unowned)
        params.push('unowned=1');

    return '/diplomas' + (params.length ? '?' + params.join('&') : '');
}

function isDbError(result) {
    return Array.isArray(result) && result[0] != null && result[0].error != null;
}

// The same resolution as schemas/diplomas/diplomas.js's attachManagerInfo —
// intentionally a separate copy (not exported/required from the schema), because the
// schema file runs a NEWSCHEMA registration on load, which we don't want to
// trigger again from a controller; this few-lines-long duplication is cheaper than
// extracting such a small helper function into a shared module.
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

// Returns the logged-in user's "owned"/"under review" indicator as a
// diplomaId -> 'owned'|'inprogress' map, from a single query for all
// diplomas in the list (not per-diploma separately, see resolveSubmitCtaState
// in the detail view, which runs for a single diploma, so batching wasn't needed there).
// If a user has multiple submissions for the same diploma (e.g. previously
// rejected, then resubmitted), OWNED_STATUSES always overrides
// `inprogress` — the end result matters, not the submission order.
async function loadOwnedStatuses(diplomas, user) {
    let ids = diplomas.map(d => String(d._id));

    if (!ids.length)
        return {};

    let submissions = await MDB.find(process.env.MONGODB_DB_NAME, 'submissions', {
        userId: user._id,
        diplomaId: { $in: ids },
        status: { $in: OWNED_STATUSES.concat(IN_PROGRESS_STATUSES) }
    }, { projection: { diplomaId: 1, status: 1 } });

    if (isDbError(submissions))
        return {};

    let byId = {};
    for (let i = 0, n = submissions.length; i < n; i++) {
        let current = byId[submissions[i].diplomaId];
        if (current === 'owned')
            continue;
        byId[submissions[i].diplomaId] = OWNED_STATUSES.indexOf(submissions[i].status) !== -1 ? 'owned' : 'inprogress';
    }

    return byId;
}

function buildListItem(d, language, ownedStatus) {
    let deadlineText = d.deadlineType === 'deadline' && d.deadlineDate
        ? RESOURCE(language, 'diplomas.public.detail.deadline.until').replace('{0}', new Date(d.deadlineDate).toLocaleDateString(language))
        : RESOURCE(language, 'diplomas.deadline.continuous');

    let feeText = d.pricing && d.pricing.pdfFee > 0
        ? d.pricing.pdfFee + ' ' + d.pricing.currency
        : RESOURCE(language, 'diplomas.public.list.fee.free');

    let managerText = d.managerInfo
        ? RESOURCE(language, 'diplomas.public.list.manager').replace('{0}', d.managerInfo.callsign || d.managerInfo.email)
        : null;

    let isExpired = d.deadlineType === 'deadline' && d.deadlineDate && new Date(d.deadlineDate) < new Date();

    // "Stamp" over the card/preview image (per user request, replacing the original
    // opacity-based dimming, because that "wasn't emphatic enough"):
    // green if the certificate is actually owned (see OWNED_STATUSES), red if
    // the application deadline has expired (AND it's not yet owned — an earned
    // certificate gets the green stamp even if the diploma's deadline has since
    // passed, since it no longer can/needs to be earned again). In the expired-but-not-
    // earned case there is INTENTIONALLY no "Owned" label — only the stamp
    // visually indicates that this diploma is "closed".
    let stampType = ownedStatus === 'owned' ? 'owned' : (isExpired ? 'expired' : null);
    let stampLabel = stampType ? RESOURCE(language, 'diplomas.public.list.stamp.' + stampType) : null;

    return {
        id: d._id,
        name: d.name,
        isChallenge: d.type === 'challenge',
        hasImage: !!(d.blankImage && d.blankImage.watermarkedKey),
        deadlineText: deadlineText,
        // Only for sorting (see compareListItems below) — the "expiring soon"
        // order puts diplomas with a concrete deadline that HASN'T yet passed
        // in ascending order by the nearest deadline; `null` if
        // continuous (no deadline) or already expired.
        deadlineTimestamp: (d.deadlineType === 'deadline' && d.deadlineDate && !isExpired) ? new Date(d.deadlineDate).getTime() : null,
        feeText: feeText,
        managerText: managerText,
        ownedStatus: ownedStatus || null,
        stampType: stampType,
        stampLabel: stampLabel
    };
}

// List order introduced per user request: first the "expiring soon"
// (still earnable, with a concrete deadline) diplomas, in ascending order by
// nearest deadline; then the continuous (no deadline, still not
// earned/not expired) diplomas; then the diplomas of already submitted/under-review
// ("in progress") submissions; finally the already earned diplomas — the
// expired-but-not-earned ("dead", never going to become anything) diplomas
// go last. Within the same "rank", the original (upload date)
// order is kept (Array.prototype.sort is stable in Node.js).
function listItemRank(item) {
    if (item.ownedStatus === 'owned')
        return 3;

    if (item.ownedStatus === 'inprogress')
        return 2;

    if (item.stampType === 'expired')
        return 4;

    return 1;
}

function compareListItems(a, b) {
    let rankDiff = listItemRank(a) - listItemRank(b);

    if (rankDiff !== 0)
        return rankDiff;

    let aDeadline = a.deadlineTimestamp == null ? Infinity : a.deadlineTimestamp;
    let bDeadline = b.deadlineTimestamp == null ? Infinity : b.deadlineTimestamp;

    return aDeadline - bDeadline;
}

// Produces a human-language description of a matchRules row. If the manager
// specified a free-text "Label" (rule.label), that takes priority — it exists
// exactly for this purpose, the public display (see the admin help text for
// diplomas.rule.label). If not, a generic, field+condition-based sentence is
// generated from the resource files' templates ({field}/{value} substitution).
function describeMatchRule(rule, language, ruleMode) {
    let fieldLabel = RESOURCE(language, 'diplomas.rule.field.' + rule.field) || rule.field;
    let valueText = Array.isArray(rule.value) ? rule.value.join(', ') : String(rule.value);

    if (rule.field === 'mode' && rule.operator === 'group')
        valueText = GROUP_LABELS[rule.value] || rule.value;

    if (rule.field === 'band' && rule.operator === 'group')
        valueText = BAND_GROUP_LABELS[rule.value] || rule.value;

    let text;

    if (rule.label) {
        text = rule.label;
    } else {
        let template = RESOURCE(language, 'diplomas.rule.sentence.' + rule.operator) || '{field}: {value}';
        text = template.replace('{field}', fieldLabel).replace('{value}', valueText);
    }

    return {
        text: text,
        points: ruleMode === 'points' ? rule.points : null
    };
}

// Converts a category's (e.g. "CW") tier ladder (Bronze/Silver/Gold, with a
// per-region minimum score) into display-ready form.
function describeCategory(category) {
    return {
        label: category.label,
        tiers: (category.tiers || []).map(tier => ({
            label: tier.label,
            home: tier.minPoints ? tier.minPoints.home : 0,
            eu: tier.minPoints ? tier.minPoints.eu : 0,
            dx: tier.minPoints ? tier.minPoints.dx : 0
        }))
    };
}
