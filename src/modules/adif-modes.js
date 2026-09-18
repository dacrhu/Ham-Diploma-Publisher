// adif-modes.js — grouping of ADIF Mode values (CW/PHONE/DIGITAL/IMAGE).
//
// Why this is needed: a common requirement for a diploma rule is to award
// points by mode (e.g. CW 3, SSB 2, FM 1, Digi 1) — but the "digi" category
// has DOZENS of concrete ADIF Mode values (FT8, FT4, RTTY, PSK31, JS8, ...),
// and these keep growing. If every digi mode had to be set up individually
// for a diploma, that would be unmanageable — but if we just lumped
// everything into a single "DIGITAL" group, then a diploma EXPLICITLY issued
// for FT8 would incorrectly also accept e.g. an RTTY contact.
//
// Solution: the rule's (matchRules) 'mode' field can choose from 3 operators:
// 'equals' / 'in_list' (specific mode(s), e.g. only "FT8"), or 'group' (an
// entire group, e.g. "DIGITAL" — any of its members count).
//
// IMPORTANT: this list is NOT the complete ADIF Mode enumeration (that's
// about 90 values), it only contains the most common modes still actively
// used today. If a manager wants to use a mode that isn't here, they can
// still enter it freely with the 'equals'/'in_list' operator (the system
// doesn't restrict the concrete mode values via validation, only the
// 'group' name) — this list is mainly needed for the admin UI's convenience
// autocomplete and for the 'group' grouping. It's worth extending
// occasionally with new digital modes as they become widespread.
global.ADIF_MODES = {};

ADIF_MODES.GROUPS = {
    CW: ['CW'],
    PHONE: ['SSB', 'USB', 'LSB', 'FM', 'AM'],
    DIGITAL: [
        'FT8', 'FT4', 'RTTY', 'PSK31', 'PSK63', 'PSK125', 'JS8', 'JT65', 'JT9', 'JT4',
        'WSPR', 'MFSK', 'OLIVIA', 'THOR', 'DOMINO', 'DOMINOEX', 'CONTESTIA', 'MT63',
        'HELL', 'FSK441', 'MSK144', 'Q65', 'ROS', 'VARA', 'PACTOR', 'WINMOR', 'ARDOP',
        'GTOR', 'AMTORFEC', 'CHIP', 'CLO', 'ISCAT', 'DMR'
    ],
    IMAGE: ['SSTV', 'FAX', 'ATV']
};

ADIF_MODES.GROUP_NAMES = Object.keys(ADIF_MODES.GROUPS);

// All known concrete mode values in a flat list (for admin UI autocomplete).
ADIF_MODES.ALL = [].concat.apply([], ADIF_MODES.GROUP_NAMES.map(g => ADIF_MODES.GROUPS[g]));

// Which group(s) a given mode value belongs to (for the future rule engine,
// step 6 — a mode could in principle belong to multiple groups, though no
// overlap currently occurs in this list).
ADIF_MODES.groupsOf = function (mode) {
    mode = (mode || '').toUpperCase();
    let result = [];
    for (let i = 0, n = ADIF_MODES.GROUP_NAMES.length; i < n; i++) {
        let g = ADIF_MODES.GROUP_NAMES[i];
        if (ADIF_MODES.GROUPS[g].indexOf(mode) !== -1)
            result.push(g);
    }
    return result;
};
