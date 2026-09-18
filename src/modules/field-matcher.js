// field-matcher.js — egy diploma matchRules-sorának (schemas/diplomas/diplomas.js
// RULE_OPERATORS) kiértékelése egy QSO-mezőértékre. Ezt hívja a rule-engine
// (modules/rule-engine.js) minden (QSO, szabály) párra.
//
// Minden összehasonlítás case-insensitive (upper-upper) — az ADIF mezőértékek
// (hívójel, mód) és a diploma szabály-értékek tárolási konvenciója (lásd
// schemas/diplomas/diplomas.js sanitizeMatchRules) is nagybetűs/kisbetűs
// keveréket használ mezőnként, ezért itt egységesen a KÉT OLDALT nagybetűsítve
// hasonlítjuk össze, nem a tárolt konvencióra hagyatkozva.
global.FIELD_MATCHER = {};

// value: a QSO adott mezőjének értéke (string). rule: {field, operator, value, points}.
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

// A "*"/"?" glob-mintát regexre alakítja — "*" = tetszőleges (akár 0 hosszú)
// karaktersorozat, "?" = pontosan 1 tetszőleges karakter, minden más karakter
// escape-elve (a hívójelekben előforduló "/" is szó szerint értendő).
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

// Hibás regex mintánál nem illeszkedik (nem dob) — a diploma mentésekor a
// schemas/diplomas/diplomas.js findInvalidRegexRule() már elutasítja az
// érvénytelen mintákat, ez itt csak egy védőháló futásidőben.
function matchRegex(value, pattern) {
    if (!value || !pattern)
        return false;

    try {
        return new RegExp(pattern, 'i').test(value);
    } catch (e) {
        return false;
    }
}

// Csak 'mode' és 'band' mezőnél értelmezett (lásd schemas/diplomas/diplomas.js
// RULE_OPERATORS komment) — a `group` érték egy ADIF_MODES.GROUP_NAMES vagy
// ADIF_BANDS.GROUP_NAMES tag, a konkrét QSO-mezőérték ennek a csoportnak a
// tagja-e a `groupsOf()` szerint.
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
