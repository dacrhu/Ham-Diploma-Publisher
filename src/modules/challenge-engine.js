// challenge-engine.js — performs the per-round drawing and the per-round
// evaluation of the uploaded log for the "challenge" type diploma (application
// -> per-round drawing from a target pool, see the `challenge` configuration
// in schemas/diplomas/diplomas.js). Called by
// controllers/submissions.js's apply_challenge/upload_challenge_log.
//
// IMPORTANT SCOPE: this, similarly to modules/rule-engine.js, ONLY performs a
// technical match check (whether the applicant "worked" the drawn targets) —
// there is no scoring/checklist concept here (a challenge diploma is always
// checklist/rule-engine-free on save, see the diplomas.js save action), and it
// does not decide acceptance/rejection in place of the manager.
global.CHALLENGE_ENGINE = {};

// challenge: diploma.challenge (or the submission.challengeSnapshot saved at
// application time -- the two have identical content). usedTargets: already
// drawn VALUES (string[]) -- only taken into account if
// allowRepeatAcrossRounds=false (see the sanitizeChallenge comment: without
// repetition the pool MUST have at least drawPerRound*totalRounds elements,
// this is validated on the admin side). Fewer than `count` elements may also
// be returned if the (filtered) pool is smaller -- this is a known, admin-side
// validation gap (see the comment on the caller side), here we only guard
// against it, we don't error out on it.
CHALLENGE_ENGINE.drawTargets = function (challenge, usedTargets, count) {
    let used = {};

    if (!challenge.allowRepeatAcrossRounds) {
        for (let i = 0, n = usedTargets.length; i < n; i++) {
            used[String(usedTargets[i]).toUpperCase()] = true;
        }
    }

    let pool = challenge.targetPool.filter(item => !used[item.value.toUpperCase()]);

    for (let i = pool.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        let tmp = pool[i];
        pool[i] = pool[j];
        pool[j] = tmp;
    }

    return pool.slice(0, count).map(item => ({ value: item.value, label: item.label }));
};

// targets: the round's CURRENT target array (possibly already partially
// matched from an earlier upload) -- this call is CUMULATIVE, it NEVER resets
// an already matched:true target back to false, even if the newly uploaded
// log doesn't currently contain it (the applicant may upload the round's QSOs
// in several parts, see the comment on controllers/submissions.js's
// upload_challenge_log). qsos: the output of ADIF_PARSER.parse() from the
// MOST RECENTLY uploaded log. Returns the (mutated) targets array, whether
// each target has been fulfilled, AND a `qsoBreakdown` (at the user's
// request, 2026-09-18: "if something isn't right, show them what's wrong")
// -- a diagnostic entry for EVERY QSO in the JUST uploaded log: which target
// it satisfied (`matchedTargetValue`), or if none, EXACTLY why not
// (`excludedReason`, see below) -- this is shown on the submission page, so
// the applicant can see what's missing/wrong after a failed upload, not just
// that it "failed".
CHALLENGE_ENGINE.evaluateRound = function (challenge, targets, qsos) {
    let allowedBands = Array.isArray(challenge.allowedBands) ? challenge.allowedBands : [];
    let allowedModes = Array.isArray(challenge.allowedModes) ? challenge.allowedModes : [];
    let commentFilterRegex = challenge.commentFilterRegex || null;
    let qsoBreakdown = [];

    for (let q = 0, qn = qsos.length; q < qn; q++) {
        let qso = qsos[q];
        let entry = {
            call: qso.call,
            band: qso.band,
            mode: qso.mode,
            comment: qso.comment,
            qsoDate: qso.qsoDate,
            matchedTargetValue: null,
            matchedTargetLabel: null,
            excludedReason: null
        };

        let filterReason = failingFilterReason(qso, allowedBands, allowedModes, commentFilterRegex);

        if (filterReason) {
            entry.excludedReason = filterReason;
        } else {
            // We go through the targets in two passes: first we also look at
            // an ALREADY fulfilled target (so we can distinguish the "this
            // QSO repeats a target that was already fulfilled earlier by
            // another QSO" case from the "this QSO doesn't match ANY of them"
            // case -- the two require different user feedback), then we mark
            // as fulfilled specifically the first NOT YET fulfilled, matching
            // target.
            let matchesAnyTargetValue = false;
            let matchedTarget = null;
            let matchedIndex = -1;

            for (let t = 0, tn = targets.length; t < tn; t++) {
                if (!isMatch(qso, challenge.targetField, targets[t].value))
                    continue;

                matchesAnyTargetValue = true;

                if (!targets[t].matched) {
                    matchedTarget = targets[t];
                    matchedIndex = t;
                    break;
                }
            }

            if (matchedTarget) {
                matchedTarget.matched = true;
                matchedTarget.matchedQso = {
                    qsoRef: matchedIndex,
                    call: qso.call,
                    band: qso.band,
                    mode: qso.mode,
                    comment: qso.comment,
                    qsoDate: qso.qsoDate
                };
                entry.matchedTargetValue = matchedTarget.value;
                entry.matchedTargetLabel = matchedTarget.label;
            } else if (matchesAnyTargetValue) {
                entry.excludedReason = 'already_matched';
            } else {
                entry.excludedReason = 'no_target_match_' + challenge.targetField;
            }
        }

        qsoBreakdown.push(entry);
    }

    return { targets: targets, allMatched: targets.every(t => t.matched), qsoBreakdown: qsoBreakdown };
};

// The same Fisher-Yates + slice pattern as controllers/submissions.js's
// drawQslSample(), except it draws only from the round's ALREADY FULFILLED
// targets (not from a full qsoBreakdown) -- for the challenge type there is no
// "excluded/non-matching QSO" concept, every matched target is an equally
// eligible candidate.
CHALLENGE_ENGINE.drawQslSample = function (targets, count) {
    if (!(count > 0))
        return [];

    let matched = targets.filter(t => t.matched);

    for (let i = matched.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        let tmp = matched[i];
        matched[i] = matched[j];
        matched[j] = tmp;
    }

    return matched.slice(0, count).map(t => ({ qsoRef: t.matchedQso.qsoRef, call: t.matchedQso.call, imageFile: null }));
};

// See modules/rule-engine.js's applyValidityFilters -- here for the challenge
// type there is its OWN band/mode filter (challenge.allowedBands/allowedModes,
// not the standard diploma-level allowedBands/matchRules 'mode' field), because
// the challenge type doesn't use matchRules (see diplomas.js). Empty array =
// no restriction.
//
// `commentFilterRegex` is a STANDALONE, GLOBAL (INDEPENDENT of targetField)
// CONDITION (at the user's request, 2026-09-18) -- a single regular expression
// that applies to the whole diploma (see sanitizeChallenge), which matches
// against the log's COMMENT field, and restricts, COMPLETELY INDEPENDENTLY of
// the target match, with an AND relationship, which QSOs can be considered at
// all. E.g.: targetField:'country', pool: ["HA","OE"] (callsign prefixes),
// commentFilterRegex: "TG[0-9]{3,4}" -- an "OE1BB / TG98" QSO would match the
// "OE" prefix, BUT the "TG98" comment contains only 2 digits, it does NOT match
// the "TG[0-9]{3,4}" pattern, so this QSO is NOT considered AT ALL (it drops
// out the same way as if it had been on the wrong band/mode) -- an
// "HA1AA / TG123" QSO, on the other hand, satisfies both conditions.
//
// Returns the key of the FIRST failed condition ('band'/'mode'/
// 'comment_filter'), or null if the QSO passed all of them -- this key goes
// directly into the qsoBreakdown's `excludedReason` field (see evaluateRound),
// which controllers/submissions.js's decorateChallengeRound() resolves into
// the `submissions.detail.challenge.qso.reason.<key>` resource key for the
// diagnostic text shown to the user.
function failingFilterReason(qso, allowedBands, allowedModes, commentFilterRegex) {
    if (allowedBands.length && allowedBands.indexOf(qso.band) === -1)
        return 'band';

    if (allowedModes.length && allowedModes.indexOf(qso.mode) === -1)
        return 'mode';

    if (commentFilterRegex) {
        // The admin-side save (schemas/diplomas/diplomas.js
        // isValidRegexString) has already validated that this is a valid
        // regex -- this try/catch is just a safety net against a
        // configuration that might still be invalid, saved earlier (before
        // the validation was introduced), so it doesn't throw out the whole
        // round's evaluation.
        try {
            if (!new RegExp(commentFilterRegex, 'i').test(qso.comment))
                return 'comment_filter';
        } catch (e) {
            return 'comment_filter';
        }
    }

    return null;
}

// Match check by targetField -- see the CHALLENGE_TARGET_FIELDS comment
// (schemas/diplomas/diplomas.js): 'call' is an exact callsign (exact match),
// 'comment' is free text from the log's COMMENT field (PARTIAL/contains match
// -- the operator writes e.g. the repeater/talkgroup name into it), and
// 'country' is a callsign-PREFIX match (e.g. pool value "HA" or "OE" ->
// whether the QSO's callsign starts with this prefix) -- this is a simple but,
// in practice, well-working "which country was worked" check, without a FULL
// DXCC database (modules/dxcc-prefixes.js); the more precise, actual
// DXCC-entity resolution remains a LATER step, not built here.
function isMatch(qso, targetField, value) {
    let needle = String(value).toUpperCase();

    if (targetField === 'call')
        return qso.call === needle;

    if (targetField === 'comment')
        return qso.comment.toUpperCase().indexOf(needle) !== -1;

    if (targetField === 'country')
        return qso.call.indexOf(needle) === 0;

    return false;
}
