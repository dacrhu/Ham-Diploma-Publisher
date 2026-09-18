// adif-bands.js — ADIF Band-értékek csoportosítása (HF/VHF/UHF).
//
// Ugyanaz a probléma/megoldás-minta, mint a modules/adif-modes.js-nél: egy
// diploma szabálynál gyakori igény, hogy SÁVRA adjunk pontot (pl. 80m 3, 40m 2,
// 20m 1 — sávonkénti pontozás), vagy hogy a diploma csak BIZONYOS sávokon
// teljesíthető legyen (pl. csak 80m/40m). A matchRules 'band' mezőjénél 3
// operátor közül lehet választani: 'equals' / 'in_list' (konkrét sáv(ok), pl.
// csak "80m"), vagy 'group' (egy egész sávtartomány, pl. "VHF").
//
// FONTOS: ez a lista NEM teljes ADIF Band enumeráció (pl. hiányoznak a
// mikrohullámú sávok), csak a rádióamatőr diplomáknál leggyakrabban használt
// sávokat tartalmazza. Az ADIF konvenciónak megfelelően kisbetűs "m"/"cm"
// jelöléssel (pl. "80m", "70cm") — a szerveroldali sanitizeMatchRules ennek
// megfelelően kisbetűsíti a beírt értékeket. Ha egy manager olyan sávot
// szeretne használni, ami itt nincs, azt 'equals'/'in_list' operátorral akkor
// is megadhatja szabadszavasan — ez a lista elsősorban az admin UI kényelmi
// autocomplete-jéhez és a 'group' csoportosításhoz kell.
global.ADIF_BANDS = {};

ADIF_BANDS.GROUPS = {
    HF: ['2200m', '630m', '160m', '80m', '60m', '40m', '30m', '20m', '17m', '15m', '12m', '10m'],
    VHF: ['6m', '4m', '2m', '1.25m'],
    UHF: ['70cm', '33cm', '23cm', '13cm']
};

ADIF_BANDS.GROUP_NAMES = Object.keys(ADIF_BANDS.GROUPS);

// Az összes ismert konkrét sáv-érték egy lapos listában (admin UI autocomplete-hez).
ADIF_BANDS.ALL = [].concat.apply([], ADIF_BANDS.GROUP_NAMES.map(g => ADIF_BANDS.GROUPS[g]));

// Melyik csoport(ok)ba tartozik egy adott sáv-érték (a jövőbeli rule-engine-nek,
// 6. lépés).
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
