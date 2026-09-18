// adif-bands.js — grouping of ADIF Band values (HF/VHF/UHF).
//
// The same problem/solution pattern as in modules/adif-modes.js: a common
// requirement for a diploma rule is to award points PER BAND (e.g. 80m 3, 40m 2,
// 20m 1 — per-band scoring), or to require the diploma to only be achievable on
// CERTAIN bands (e.g. only 80m/40m). The matchRules 'band' field offers a choice
// of 3 operators: 'equals' / 'in_list' (specific band(s), e.g. only "80m"), or
// 'group' (a whole band range, e.g. "VHF").
//
// IMPORTANT: this list is NOT a complete ADIF Band enumeration (e.g. the
// microwave bands are missing), it only contains the bands most commonly used
// in radio amateur diplomas. Using the lowercase "m"/"cm" notation per the ADIF
// convention (e.g. "80m", "70cm") — the server-side sanitizeMatchRules
// lowercases entered values accordingly. If a manager wants to use a band that
// isn't in here, they can still enter it freely with the 'equals'/'in_list'
// operator — this list is primarily for the admin UI's convenience
// autocomplete and for the 'group' grouping.
global.ADIF_BANDS = {};

ADIF_BANDS.GROUPS = {
    HF: ['2200m', '630m', '160m', '80m', '60m', '40m', '30m', '20m', '17m', '15m', '12m', '10m'],
    VHF: ['6m', '4m', '2m', '1.25m'],
    UHF: ['70cm', '33cm', '23cm', '13cm']
};

ADIF_BANDS.GROUP_NAMES = Object.keys(ADIF_BANDS.GROUPS);

// All known concrete band values in a flat list (for the admin UI autocomplete).
ADIF_BANDS.ALL = [].concat.apply([], ADIF_BANDS.GROUP_NAMES.map(g => ADIF_BANDS.GROUPS[g]));

// Which group(s) a given band value belongs to (for the future rule-engine,
// step 6).
ADIF_BANDS.groupsOf = function (band) {
    band = (band || '').toLowerCase();
    let result = [];
    for (let i = 0, n = ADIF_BANDS.GROUP_NAMES.length; i < n; i++) {
        let g = ADIF_BANDS.GROUP_NAMES[i];
        if (ADIF_BANDS.GROUPS[g].indexOf(band) !== -1)
            result.push(g);
    }
    return result;
};
