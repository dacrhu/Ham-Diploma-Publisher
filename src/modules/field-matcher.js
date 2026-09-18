// field-matcher.js — evaluates one row of a diploma's matchRules (schemas/diplomas/diplomas.js
// RULE_OPERATORS) against a QSO field value. Called by the rule-engine
// (modules/rule-engine.js) for every (QSO, rule) pair.
//
// Every comparison is case-insensitive (upper-upper) — the ADIF field values
// (callsign, mode) and the diploma rule values' storage convention (see
// schemas/diplomas/diplomas.js sanitizeMatchRules) use a mix of upper/lower
// case per field, so here we uniformly uppercase BOTH SIDES for comparison
// instead of relying on the stored convention.
global.FIELD_MATCHER = {};

// value: the value of the given QSO field (string). rule: {field, operator, value, points}.
FIELD_MATCHER.match = function (value, rule) {
    value = String(value == null ? '' : value).trim();

    switch (rule.operator) {
        case 'equals':
            return value.toUpperCase() === String(rule.value).toUpperCase();

        case 'contains':
            return !!value && value.toUpperCase().indexOf(String(rule.value).toUpperCase()) !== -1;

        case 'in_list':
            return matchInList(value, rule.value);

        case 'wildcard':
            return matchWildcard(value, String(rule.value));

        case 'regex':
            return matchRegex(value, String(rule.value));

        case 'group':
            return matchGroup(value, String(rule.value), rule.field);

        default:
            return false;
    }
};

function matchInList(value, list) {
    if (!value)
        return false;

    let upper = value.toUpperCase();
    let items = Array.isArray(list) ? list : [list];

    for (let i = 0, n = items.length; i < n; i++) {
        if (String(items[i]).toUpperCase() === upper)
            return true;
    }

    return false;
}

// Converts a "*"/"?" glob pattern to a regex — "*" = any (even 0-length)
// character sequence, "?" = exactly 1 arbitrary character, every other
// character escaped (the "/" found in callsigns is also meant literally).
function matchWildcard(value, pattern) {
    if (!value || !pattern)
        return false;

    let escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');

    try {
        return new RegExp('^' + escaped + '$', 'i').test(value);
    } catch (e) {
        return false;
    }
}

// On an invalid regex pattern, it does not match (does not throw) — when the
// diploma is saved, schemas/diplomas/diplomas.js findInvalidRegexRule() already
// rejects invalid patterns, this here is just a runtime safety net.
function matchRegex(value, pattern) {
    if (!value || !pattern)
        return false;

    try {
        return new RegExp(pattern, 'i').test(value);
    } catch (e) {
        return false;
    }
}

// Only meaningful for the 'mode' and 'band' fields (see schemas/diplomas/diplomas.js
// RULE_OPERATORS comment) — the `group` value is an ADIF_MODES.GROUP_NAMES or
// ADIF_BANDS.GROUP_NAMES member, checking whether the concrete QSO field value
// belongs to that group according to `groupsOf()`.
function matchGroup(value, group, field) {
    if (!value || !group)
        return false;

    group = group.toUpperCase();

    if (field === 'mode')
        return ADIF_MODES.groupsOf(value).indexOf(group) !== -1;

    if (field === 'band')
        return ADIF_BANDS.groupsOf(value).indexOf(group) !== -1;

    return false;
}
