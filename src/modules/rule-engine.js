// rule-engine.js — egy beadott napló (ADIF_PARSER.parse eredménye) automatikus
// kiértékelése egy diploma szabályrendszere (schemas/diplomas/diplomas.js)
// szerint. Ezt hívja a controllers/submissions.js feltöltéskor.
//
// FONTOS HATÓKÖR: ez KIZÁRÓLAG a technikai jogosultság-ellenőrzést végzi el
// (teljesíti-e a beadvány a szabályokat) — nem dönt "elfogadás/elutasítás"-ról
// a manager helyett, az a review UI (lásd controllers/submissions.js). Az
// `eligibleAuto=false` eset a hívó oldalon `rejected_auto` végállapotot jelent
// (nincs manager-teendő); `eligibleAuto=true` esetén a beadvány a
// QSL-mintavételezésre vagy a manager-review-sorba kerül, ettől a modultól
// függetlenül.
global.RULE_ENGINE = {};

// diploma: a MongoDB diplomas dokumentum. qsos: ADIF_PARSER.parse() kimenete.
// applicantCountry: a jelentkező FIÓKJÁBAN regisztrált ország (ISO alpha-2,
// users.country) — NEM a hívójel DXCC-prefixéből számolt ország (az egy
// külön, a challenge-jelentkezéshez tervezett modules/dxcc-prefixes.js
// hatóköre, ide nem tartozik).
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
        // Pontozás módban egy QSO TÖBB szabályra is illeszkedhet (pl. egy
        // hívójel-mező egyszerre matchel egy szűkebb ÉS egy tágabb wildcardra
        // is, mint "OE7*" és "OE*") — ilyenkor NEM adódnak össze a pontok,
        // hanem csak a legtöbbet érő illeszkedő szabály "alkalmazódik"
        // (felhasználói döntés, MEGFORDÍTVA a korábbi, "a pontok összeadódnak"
        // tervezési döntést — globális maximum, MEZŐTŐL FÜGGETLENÜL: pl. egy
        // egyszerre hívójel- ÉS comment-szabálynak is megfelelő QSO-nál is csak
        // az egy legmagasabb pontú szabály számít, a másik NEM adódik hozzá). Checklist
        // módban ez nem értelmezett (ott nincs QSO-szintű pontszám, minden
        // illeszkedő szabály `ruleSatisfied`-je számít, ezért ott továbbra is
        // MINDEN illeszkedő szabály bekerül a `matchedRules`-be).
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

        // Az átjátszós bónusz csak egy MÁR a szabályok szerint is illeszkedő
        // QSO-hoz adódik hozzá — egy egyébként a diplomához nem kapcsolódó
        // (egyetlen matchRules-nek sem megfelelő) QSO önmagában, csak attól,
        // hogy átjátszón történt, nem válik érvényessé. Ez a bónusz a fenti
        // "csak a legjobb szabály számít" logikától FÜGGETLENÜL mindig
        // hozzáadódik (nem szabály-illesztés, hanem külön diploma-beállítás).
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

// Diploma-szintű érvényességi szűrők (a szabály-illesztéstől FÜGGETLENÜL dönti
// el, hogy egy QSO egyáltalán számításba jöhet-e) — lásd a diploma allowedBands
// és repeaterAllowed mezőinek kommentjét schemas/diplomas/diplomas.js-ben.
function applyValidityFilters(items, allowedBands, repeaterAllowed) {
    for (let i = 0, n = items.length; i < n; i++) {
        let item = items[i];

        // Ha a diploma sáv-korlátozást ad meg, egy hiányzó (napló nem tartalmazza
        // a BAND mezőt) vagy nem listázott sávú QSO konzervatívan érvénytelen —
        // nem kockáztatjuk, hogy egy azonosíthatatlan sávú QSO tévesen beleszámítson.
        if (allowedBands.length && allowedBands.indexOf(item.qso.band) === -1) {
            item.excludedReason = 'band';
            continue;
        }

        // Átjátszó-detektálás: az ADIF 3.x Propagation_Mode enumeráció "RPT"
        // értéke ("terresztriális átjátszó/transzponder") a hivatalos,
        // dokumentált jelzés erre — a napló <PROP_MODE:3>RPT mezőjéből olvasva
        // (lásd modules/adif-parser.js). Ha a manager nem engedélyezi az
        // átjátszót, egy ilyen QSO teljes egészében kizárva.
        if (!repeaterAllowed && item.qso.propMode === 'RPT') {
            item.excludedReason = 'repeater';
        }
    }
}

// Duplikátum-kezelés (schemas/diplomas/diplomas.js duplicatePolicy): a napló
// kronológiai sorrendjében (QSO_DATE+TIME_ON, hiányzó dátumnál az eredeti
// napló-sorrend a tiebreak) az ELSŐ előfordulás számít, a policy szerinti
// kulccsal (call, vagy call+band+mode) egyező KÉSŐBBI QSO-k duplikátumnak
// jelölve — csak a validity-szűrőn már átjutott QSO-kon fut.
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

// A jelentkező körzete a diploma "hazai" országához képest — lásd a fenti
// RULE_ENGINE.evaluate komment a homeCountry vs. DXCC-prefix döntésről.
function determineZone(applicantCountry, homeCountry) {
    let country = String(applicantCountry || '').toUpperCase();
    let home = String(homeCountry || '').toUpperCase();

    if (home && country === home)
        return 'home';

    return COUNTRIES.isEU(country) ? 'eu' : 'dx';
}

// Checklist mód: minden matchRules sornak illeszkednie kell LEGALÁBB EGY
// (érvényes, nem duplikátum) QSO-ra — a pontszámnak itt nincs szerepe.
// Szabály nélküli diploma (üres matchRules) sose eligibilis — defenzív eset,
// az admin UI amúgy megköveteli legalább egy szabály megadását.
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

// Pontozás mód, fokozatok NÉLKÜL: a diploma-szintű zoneThresholds a mérvadó,
// a jelentkezőnek a saját körzete szerinti minimumot kell elérnie az összes
// illeszkedő szabály pontjainak összegével. Hiányzó (null) küszöb = nincs
// külön minimum ehhez a körzethez (lásd diplomas.zone.help szöveg) -> 0-ként
// kezelve, azaz bármilyen (akár 0) pontszám automatikusan megfelel.
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

// Pontozás mód, fokozatokkal: minden kategóriára (categoriesEnabled esetén az
// adásmód-csoport szerint szűrt QSO-alhalmazon, egyébként az összes QSO-n,
// "Mixed" kategóriaként) kiszámítja a kategórián belüli pontösszeget, majd a
// (már `minPoints.home` szerint növekvő sorrendben tárolt, lásd
// sanitizeTiers() schemas/diplomas/diplomas.js-ben) fokozat-létrán a
// legmagasabb elért fokozatot. A beadvány automatikusan eligibilis, ha
// LEGALÁBB EGY kategóriában elér legalább egy fokozatot (egy beadvány több
// kategóriában is teljesíthet egyszerre, lásd a diploma admin súgó-szövegét).
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

            // A tiers tömb minPoints.home szerint növekvő sorrendben van tárolva
            // -> a legutolsó elért elem a legmagasabb elért fokozat.
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
