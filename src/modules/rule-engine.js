// rule-engine.js — automatic evaluation of a submitted log (the result of
// ADIF_PARSER.parse) against a diploma's rule set (schemas/diplomas/diplomas.js).
// Called by controllers/submissions.js on upload.
//
// IMPORTANT SCOPE: this ONLY performs the technical eligibility check (whether
// the submission satisfies the rules) — it doesn't decide "accept/reject" in
// place of the manager, that's the review UI (see controllers/submissions.js).
// The `eligibleAuto=false` case means a `rejected_auto` final state on the
// caller side (no manager action needed); with `eligibleAuto=true` the
// submission goes into QSL sampling or the manager review queue, independently
// of this module.
global.RULE_ENGINE = {};

// diploma: the MongoDB diplomas document. qsos: the output of
// ADIF_PARSER.parse(). applicantCountry: the country registered in the
// applicant's ACCOUNT (ISO alpha-2, users.country) — NOT the country computed
// from the callsign's DXCC prefix (that is the scope of a separate module,
// modules/dxcc-prefixes.js, designed for the challenge application, out of
// scope here).
RULE_ENGINE.evaluate = function (diploma, qsos, applicantCountry) {
    let ruleMode = diploma.ruleMode === 'points' ? 'points' : 'checklist';
    let matchRules = Array.isArray(diploma.matchRules) ? diploma.matchRules : [];
    let allowedBands = Array.isArray(diploma.allowedBands) ? diploma.allowedBands : [];
    let repeaterAllowed = diploma.repeaterAllowed !== false;
    let repeaterPoints = Math.max(0, Number(diploma.repeaterPoints) || 0);
    let duplicatePolicy = diploma.duplicatePolicy || 'per_band_mode';

    let items = qsos.map((qso, index) => ({
        index: index,
        qso: qso,
        excludedReason: null,
        matchedRules: [],
        autoPoints: 0
    }));

    applyValidityFilters(items, allowedBands, repeaterAllowed);
    markDuplicates(items, duplicatePolicy);

    let usableItems = items.filter(i => !i.excludedReason);
    let ruleSatisfied = matchRules.map(() => false);

    for (let u = 0, un = usableItems.length; u < un; u++) {
        let item = usableItems[u];
        // In points mode a single QSO can match MULTIPLE rules (e.g. a
        // callsign field simultaneously matches a narrower AND a broader
        // wildcard, like "OE7*" and "OE*") — in this case the points are NOT
        // added together, instead only the highest-value matching rule
        // "applies" (a user decision, REVERSING the earlier design decision
        // of "the points add up" — a global maximum, INDEPENDENT OF FIELD:
        // e.g. for a QSO that matches both a callsign AND a comment rule at
        // the same time, only that one highest-point rule counts, the other
        // is NOT added). In checklist mode this doesn't apply (there is no
        // QSO-level score there, every matching rule's `ruleSatisfied`
        // counts, so there EVERY matching rule still goes into
        // `matchedRules`).
        let bestRule = null;

        for (let ri = 0, rn = matchRules.length; ri < rn; ri++) {
            let rule = matchRules[ri];
            let fieldValue = item.qso[rule.field];

            if (FIELD_MATCHER.match(fieldValue, rule)) {
                ruleSatisfied[ri] = true;

                let matched = { ruleLabel: rule.label || null, field: rule.field, operator: rule.operator, value: rule.value, points: rule.points };

                if (ruleMode === 'points') {
                    if (!bestRule || rule.points > bestRule.points)
                        bestRule = matched;
                } else {
                    item.matchedRules.push(matched);
                }
            }
        }

        if (ruleMode === 'points' && bestRule) {
            item.matchedRules.push(bestRule);
            item.autoPoints += bestRule.points;
        }

        // The repeater bonus is only added to a QSO that ALREADY matches
        // according to the rules — a QSO that is otherwise unrelated to the
        // diploma (doesn't match any matchRules) does not become valid merely
        // because it happened over a repeater. This bonus is always added
        // INDEPENDENTLY of the "only the best rule counts" logic above (it's
        // not a rule match, but a separate diploma setting).
        if (ruleMode === 'points' && repeaterAllowed && repeaterPoints > 0 && item.qso.propMode === 'RPT' && item.matchedRules.length > 0) {
            item.autoPoints += repeaterPoints;
            item.matchedRules.push({ ruleLabel: null, field: 'repeater', operator: null, value: null, points: repeaterPoints });
        }
    }

    let matchedQsoCount = usableItems.filter(i => i.matchedRules.length > 0).length;
    let zone = determineZone(applicantCountry, diploma.homeCountry);

    let evaluation = ruleMode === 'checklist'
        ? evaluateChecklist(matchRules, ruleSatisfied)
        : (diploma.tiersEnabled ? evaluatePointsTiers(diploma, usableItems, zone) : evaluatePointsFlat(diploma, usableItems, zone));

    return {
        qsoBreakdown: items.map(item => ({
            qsoRef: item.index,
            call: item.qso.call,
            qsoDate: item.qso.qsoDate,
            band: item.qso.band,
            mode: item.qso.mode,
            comment: item.qso.comment,
            qth: item.qso.qth,
            matchedRules: item.matchedRules,
            autoPoints: item.autoPoints,
            excludedReason: item.excludedReason
        })),
        matchedQsoCount: matchedQsoCount,
        autoTotalPoints: evaluation.autoTotalPoints,
        eligibleAuto: evaluation.eligibleAuto,
        autoCheckDetails: evaluation.autoCheckDetails
    };
};

// Diploma-level validity filters (decides, INDEPENDENTLY of rule matching,
// whether a QSO can be considered at all) — see the comment on the diploma's
// allowedBands and repeaterAllowed fields in schemas/diplomas/diplomas.js.
function applyValidityFilters(items, allowedBands, repeaterAllowed) {
    for (let i = 0, n = items.length; i < n; i++) {
        let item = items[i];

        // If the diploma specifies a band restriction, a QSO with a missing
        // (the log doesn't contain the BAND field) or unlisted band is
        // conservatively invalid — we don't risk a QSO with an unidentifiable
        // band being counted in by mistake.
        if (allowedBands.length && allowedBands.indexOf(item.qso.band) === -1) {
            item.excludedReason = 'band';
            continue;
        }

        // Repeater detection: the ADIF 3.x Propagation_Mode enumeration's
        // "RPT" value ("terrestrial repeater/transponder") is the official,
        // documented indicator for this — read from the log's
        // <PROP_MODE:3>RPT field (see modules/adif-parser.js). If the manager
        // doesn't allow repeater use, such a QSO is excluded entirely.
        if (!repeaterAllowed && item.qso.propMode === 'RPT') {
            item.excludedReason = 'repeater';
        }
    }
}

// Duplicate handling (schemas/diplomas/diplomas.js duplicatePolicy): in the
// log's chronological order (QSO_DATE+TIME_ON, with the original log order as
// the tiebreak for a missing date) the FIRST occurrence counts, LATER QSOs
// matching on the policy's key (call, or call+band+mode) are marked as
// duplicates — this only runs on QSOs that already passed the validity filter.
function markDuplicates(items, policy) {
    if (policy === 'allowed')
        return;

    let candidates = items.filter(i => !i.excludedReason).slice();

    candidates.sort((a, b) => {
        let ta = a.qso.qsoDate ? a.qso.qsoDate.getTime() : Infinity;
        let tb = b.qso.qsoDate ? b.qso.qsoDate.getTime() : Infinity;
        return ta !== tb ? ta - tb : a.index - b.index;
    });

    let seen = {};

    for (let i = 0, n = candidates.length; i < n; i++) {
        let item = candidates[i];

        if (!item.qso.call)
            continue;

        let key = policy === 'once' ? item.qso.call : (item.qso.call + '|' + item.qso.band + '|' + item.qso.mode);

        if (seen[key]) {
            item.excludedReason = 'duplicate';
        } else {
            seen[key] = true;
        }
    }
}

// The applicant's zone relative to the diploma's "home" country — see the
// RULE_ENGINE.evaluate comment above about the homeCountry vs. DXCC-prefix
// decision.
function determineZone(applicantCountry, homeCountry) {
    let country = String(applicantCountry || '').toUpperCase();
    let home = String(homeCountry || '').toUpperCase();

    if (home && country === home)
        return 'home';

    return COUNTRIES.isEU(country) ? 'eu' : 'dx';
}

// Checklist mode: every matchRules row must match AT LEAST ONE (valid,
// non-duplicate) QSO — the score plays no role here. A diploma without rules
// (empty matchRules) is never eligible — a defensive case, the admin UI
// requires at least one rule to be specified anyway.
function evaluateChecklist(matchRules, ruleSatisfied) {
    let checklistResults = matchRules.map((rule, ri) => ({
        ruleLabel: rule.label || null,
        field: rule.field,
        operator: rule.operator,
        value: rule.value,
        satisfied: ruleSatisfied[ri]
    }));

    let eligibleAuto = matchRules.length > 0 && ruleSatisfied.every(Boolean);

    return {
        autoTotalPoints: 0,
        eligibleAuto: eligibleAuto,
        autoCheckDetails: { mode: 'checklist', checklistResults: checklistResults }
    };
}

// Points mode, WITHOUT tiers: the diploma-level zoneThresholds is authoritative,
// the applicant has to reach the minimum for their own zone with the sum of
// the points of all matching rules. A missing (null) threshold = no separate
// minimum for this zone (see the diplomas.zone.help text) -> treated as 0,
// i.e. any score (even 0) automatically qualifies.
function evaluatePointsFlat(diploma, usableItems, zone) {
    let autoTotalPoints = usableItems.reduce((sum, item) => sum + item.autoPoints, 0);
    let threshold = (diploma.zoneThresholds && diploma.zoneThresholds[zone] != null) ? diploma.zoneThresholds[zone] : 0;
    let eligibleAuto = autoTotalPoints >= threshold;

    return {
        autoTotalPoints: autoTotalPoints,
        eligibleAuto: eligibleAuto,
        autoCheckDetails: { mode: 'points', zone: zone, zoneThreshold: threshold }
    };
}

// Points mode, WITH tiers: for every category (if categoriesEnabled, on the
// QSO subset filtered by mode group, otherwise on all QSOs, as the "Mixed"
// category) it calculates the point total within the category, then finds the
// highest achieved tier on the tier ladder (already stored sorted in
// ascending order by `minPoints.home`, see sanitizeTiers() in
// schemas/diplomas/diplomas.js). The submission is automatically eligible if
// it reaches at least one tier in AT LEAST ONE category (a single submission
// can qualify in multiple categories at once, see the diploma admin help text).
function evaluatePointsTiers(diploma, usableItems, zone) {
    let categories = (Array.isArray(diploma.categories) ? diploma.categories : []).map(category => {
        let categoryItems = category.modeFilter
            ? usableItems.filter(item => ADIF_MODES.groupsOf(item.qso.mode).indexOf(category.modeFilter) !== -1)
            : usableItems;

        let categoryPoints = categoryItems.reduce((sum, item) => sum + item.autoPoints, 0);
        let achievedTier = null;

        let tiers = (Array.isArray(category.tiers) ? category.tiers : []).map(tier => {
            let minPoints = tier.minPoints ? (tier.minPoints[zone] || 0) : 0;
            let achieved = categoryPoints >= minPoints;

            // The tiers array is stored sorted in ascending order by
            // minPoints.home -> the last achieved element is the highest
            // achieved tier.
            if (achieved)
                achievedTier = { key: tier.key, label: tier.label };

            return { key: tier.key, label: tier.label, minPoints: minPoints, achieved: achieved };
        });

        return { key: category.key, label: category.label, points: categoryPoints, achievedTier: achievedTier, tiers: tiers };
    });

    let autoTotalPoints = usableItems.reduce((sum, item) => sum + item.autoPoints, 0);
    let eligibleAuto = categories.some(category => category.achievedTier != null);

    return {
        autoTotalPoints: autoTotalPoints,
        eligibleAuto: eligibleAuto,
        autoCheckDetails: { mode: 'points', zone: zone, categories: categories }
    };
}
