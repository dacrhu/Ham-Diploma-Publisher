// adif-modes.js — ADIF Mode-értékek csoportosítása (CW/PHONE/DIGITAL/IMAGE).
//
// Miért kell ez: egy diploma szabálynál gyakori igény, hogy adásmódra adjunk
// pontot (pl. CW 3, SSB 2, FM 1, Digi 1) — de a "digi" kategóriában TÖBB TUCAT
// konkrét ADIF Mode érték van (FT8, FT4, RTTY, PSK31, JS8, ...), és ezek folyamatosan
// bővülnek. Ha egy diplománál minden digi-módra egyenként kellene pontot beállítani,
// az kezelhetetlen — de ha csak egy "DIGITAL" csoportba sorolnánk mindent, akkor egy
// KIFEJEZETTEN FT8-ra kiírt diploma tévesen elfogadna pl. RTTY összeköttetést is.
//
// Megoldás: a szabály (matchRules) 'mode' mezőjénél 3 operátor közül lehet
// választani: 'equals' / 'in_list' (konkrét mód(ok), pl. csak "FT8"), vagy
// 'group' (egy egész csoport, pl. "DIGITAL" — bármelyik tagja számít).
//
// FONTOS: ez a lista NEM teljes ADIF Mode enumeráció (az kb. 90 érték), csak a
// leggyakoribb, ma is aktívan használt módokat tartalmazza. Ha egy manager olyan
// módot szeretne használni, ami itt nincs, azt 'equals'/'in_list' operátorral
// akkor is megadhatja szabadszavasan (a rendszer nem korlátozza validációval a
// konkrét mód-értékeket, csak a 'group' nevét) — ez a lista elsősorban az admin
// UI kényelmi autocomplete-jéhez és a 'group' csoportosításhoz kell. Időnként
// érdemes bővíteni új, elterjedté váló digitális módokkal.
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

// Az összes ismert konkrét mód-érték egy lapos listában (admin UI autocomplete-hez).
ADIF_MODES.ALL = [].concat.apply([], ADIF_MODES.GROUP_NAMES.map(g => ADIF_MODES.GROUPS[g]));

// Melyik csoport(ok)ba tartozik egy adott mód-érték (a jövőbeli rule-engine-nek,
// 6. lépés — egy mód akár több csoportba is tartozhatna, bár a jelen listában nem
// fordul elő átfedés).
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
