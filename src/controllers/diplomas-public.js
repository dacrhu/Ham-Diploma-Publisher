// diplomas-public.js — a rádióamatőrök (regisztráció nélkül is) által elérhető
// diploma-lista és részletező oldal: csak `status:'active'` diplomák, a
// szabályrendszer olvasható (nem admin-szerkeszthető) megjelenítésével + a
// biankó kép VÍZJELES előnézetével. Minden szerver-oldalon renderelt, nincs
// saját JS/API — a
// diploma-lista/részletező statikus tartalom, nem kell hozzá kliens-oldali
// fetch (szemben az admin oldalakkal, amik SPA-szerűen működnek).
//
// Az '{0}'/'{field}'/'{value}' jelölésű resource-sablonokat itt, controller
// JS-ben helyettesítjük be RESOURCE()-szal (NEM a view '@(#kulcs)' motorján
// keresztül, ami nem támogat paramétereket) — ugyanaz a minta, mint az
// email-küldésnél (lásd CLAUDE.md "Email küldés" szakasza).

// Csoport-címkék (adásmód szerinti pontozás 'group' operátora) — szándékosan
// angol szavak, ugyanúgy, ahogy a schemas/diplomas/diplomas.js CATEGORY_LABELS
// is (a kategória-címkék is mindig ezek, nyelvfüggetlenül).
const GROUP_LABELS = { CW: 'CW', PHONE: 'Phone', DIGITAL: 'Digital', IMAGE: 'Image' };
const BAND_GROUP_LABELS = { HF: 'HF', VHF: 'VHF', UHF: 'UHF' };

// "Megvan"-jelzés a diploma-listán (felhasználói kérésre) — a `submissions`
// séma (schemas/submissions/submissions.js `decide` action) állapotgépe
// alapján `approved`/`paid`/`completed` MIND azt jelenti, hogy az oklevél
// ténylegesen kiadásra került (a PDF már legenerálva, letölthető):
// `approved` a VÉGÁLLAPOT ingyenes okleveleknél (nincs mibe fizetni), `paid`
// a VÉGÁLLAPOT fizetős, PDF-only kézbesítésnél — a `completed` KIZÁRÓLAG a
// fizikai (nyomtatott/postázott) kézbesítésű okleveleknél jön létre, amikor a
// manager kézzel jelöli "teljesítve"-nek. Ezért mindhárom "OWNED"-nak számít,
// NEM csak a `completed` — eredetileg csak a `completed`-et vettük ide, de ez
// épp a leggyakoribb esetet (ingyenes/PDF-fizetős oklevél) hagyta figyelmen
// kívül, lásd a felhasználói visszajelzést. Az `awaiting_payment` (még nem
// fizetett) MARADT "in progress"-ként — ez a beadás/QSL/elbírálás-alatti
// státuszokkal együtt azt jelzi, hogy a folyamat még nem zárult le.
const OWNED_STATUSES = ['approved', 'paid', 'completed'];
const IN_PROGRESS_STATUSES = ['submitted', 'awaiting_qsl', 'pending_review', 'awaiting_payment'];

// Statisztika-oldal (felhasználói kérésre): egy diplomát ténylegesen elnyertek
// listája, régiónkénti (Hazai/EU/DX) összesítéssel a tetején, lapozható
// hívójel-lista alatta.
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

    // Típus szerinti szűrés (?type=standard|challenge, query paraméter) — szűrés
    // NÉLKÜL minden aktív diploma látszik. A szerver-oldali `MDB.find` szándékosan
    // nem szűr rá közvetlenül a lekérdezésben, mert a meglévő (a `type` mező
    // bevezetése előtti) diplomáknál a mező hiányzik -- itt, JS-ben egyszerűbb
    // `d.type || 'standard'`-ként kezelni, mint egy Mongo `$or` feltétellel.
    // Egyszerű, JS nélküli (link-alapú, oldal-újratöltős) szűrő, ugyanabban a
    // szellemben, ahogy ez az oldal amúgy is teljesen szerver-oldalon renderelt.
    let typeFilter = self.query.type === 'standard' || self.query.type === 'challenge' ? self.query.type : 'all';

    if (typeFilter !== 'all') {
        diplomas = diplomas.filter(d => (d.type || 'standard') === typeFilter);
    }

    let ownedStatusById = self.user ? await loadOwnedStatuses(diplomas, self.user) : {};

    // "Csak amit még nem nyertem el" szűrő (?unowned=1, felhasználói kérésre)
    // — CSAK bejelentkezett usernél értelmezhető (az ownedStatus is csak akkor
    // számolódik), ezért a checkbox/gomb is csak akkor jelenik meg a view-ban.
    // Az "owned" (lásd OWNED_STATUSES fentebb) ÉS a lejárt (`stampType:
    // 'expired'`, lásd buildListItem) kártyákat egyaránt rejti — utóbbit
    // felhasználói kérésre: egy lejárt határidejű diplomát MÁR SOSE lehet
    // megszerezni, tehát nem tartozik a "még megszerezhető" listába. Az
    // `inprogress` (már beadva, de még nem elbírálva/kifizetve) állapotúak
    // MARADNAK, mert azokat sem "nyerte még el".
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

    // A táblázat sor-fejlécei az admin szerkesztőből ismert, MÁR LÉTEZŐ resource
    // kulcsokat használják (diplomas.deadline.*, diplomas.fee.*.label,
    // diplomas.manager.*, diplomas.payment.*) — nincs értelme külön "public"
    // duplikátumot felvenni ugyanahhoz a fogalomhoz, a view csak a nyers értéket
    // teszi a kész fejléc mellé.
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

    // A pontos mintavételezési darabszámot (qslSampleCount) szándékosan NEM
    // áruljuk el a publikus oldalon — csak azt, hogy egyáltalán számíthat rá a
    // jelentkező —, hogy ne lehessen "kijátszani" (pl. csak annyi QSL-t
    // előkészíteni, ahányra biztosan számít).
    self.repository.qslText = diploma.qslSampleCount > 0
        ? RESOURCE(language, 'diplomas.public.detail.qsl.text')
        : null;

    self.repository.duplicateText = RESOURCE(language, 'diplomas.duplicate.' + diploma.duplicatePolicy) || '';

    // Csak akkor jelenik meg, ha a manager tényleg korlátozta a sávokat (üres
    // lista = nincs korlátozás, nincs mit mondani) — lásd a schema `allowedBands`
    // kommentjét: ez FÜGGETLEN attól, hogy van-e sávra pontozó matchRules szabály.
    // Challenge típusnál a diploma-szintű `allowedBands` mindig üres (lásd save
    // action), ott a `challenge.allowedBands` a mérvadó — ugyanaz a mondat-sablon
    // jó rá, a forrás-tömb választása típusfüggő.
    let allowedBands = diploma.type === 'challenge' ? ((diploma.challenge || {}).allowedBands || []) : (diploma.allowedBands || []);
    self.repository.allowedBandsText = allowedBands.length
        ? RESOURCE(language, 'diplomas.public.detail.allowedbands.text').replace('{0}', allowedBands.join(', '))
        : null;

    // Adásmód-korlátozás jelenleg csak a challenge diploma-típusnál értelmezett
    // (a standard típusnál erre a matchRules 'mode' mezője szolgál, ott nincs
    // hozzá diploma-szintű, pontozástól független szűrő).
    self.repository.challengeAllowedModesText = diploma.type === 'challenge' && (diploma.challenge || {}).allowedModes && diploma.challenge.allowedModes.length
        ? RESOURCE(language, 'diplomas.public.detail.challenge.allowedmodes.text').replace('{0}', diploma.challenge.allowedModes.join(', '))
        : null;

    // Csak akkor jelenítünk meg bármit, ha van érdemi közlendő: ha az átjátszó
    // kifejezetten TILOS, vagy ha van rá külön (nullától eltérő) pontérték —
    // a "megengedett, nincs külön szabály" alapállapotot (a diplomák többsége)
    // szándékosan nem jelezzük ki, hogy ne legyen felesleges zaj a legtöbb
    // diploma-oldalon.
    self.repository.repeaterText = diploma.repeaterAllowed === false
        ? RESOURCE(language, 'diplomas.public.detail.repeater.notallowed')
        : (diploma.repeaterPoints > 0
            ? RESOURCE(language, 'diplomas.public.detail.repeater.allowed.points').replace('{0}', diploma.repeaterPoints)
            : null);

    self.repository.rulesIntro = diploma.ruleMode === 'checklist'
        ? RESOURCE(language, 'diplomas.public.detail.rules.checklist.intro')
        : RESOURCE(language, 'diplomas.public.detail.rules.points.intro');

    self.repository.rules = (diploma.matchRules || []).map(rule => describeMatchRule(rule, language, diploma.ruleMode));

    // Challenge diploma (jelentkezés -> körönkénti sorsolás egy célpont-poolból,
    // lásd schemas/diplomas/diplomas.js) -- a standard checklist/pontozás
    // szabály-táblázatnak itt nincs értelme (matchRules mindig üres challenge
    // típusnál), ezért egy külön, rövid összefoglaló jelenik meg helyette (lásd
    // views/diplomas-public/detail.html). A tényleges jelentkezés még nem
    // elérhető funkció -- ugyanaz a "hamarosan elérhető" CTA vonatkozik rá is.
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

    // A fokozatonkénti/kategóriánkénti körzet-küszöbök CSAK akkor relevánsak, ha
    // a diploma használ fokozatokat (tiersEnabled) — egyébként a diploma-szintű
    // sima zoneThresholds a mérvadó (csak pontozás módban értelmezett).
    self.repository.tiersEnabled = !!diploma.tiersEnabled;
    self.repository.categories = (diploma.categories || []).map(describeCategory);

    self.repository.showFlatZones = diploma.ruleMode === 'points' && !diploma.tiersEnabled;
    self.repository.zoneHomeLabel = RESOURCE(language, 'diplomas.zone.home') + (countryName ? ' (' + countryName + ')' : '');

    // Szándékosan itt, a controllerben alakítjuk stringgé (nem a view-ban egy
    // `@{... == null ? '' : ...}` ternary-vel) — a Total.js view-motor
    // `view_is_assign()` helperje (node_modules/total4/internal.js) tévesen
    // ÉRTÉKADÁSNAK érzékeli a `repository.xxx == ...` mintát (a `==`
    // összehasonlítás első `=` karakterét nem tudja megkülönböztetni egy valódi
    // `=` értékadástól), ezért egy ilyen `@{repository....== null ? a : b}`
    // kifejezés MINDIG üres stringet renderel, a tényleges feltételtől
    // függetlenül — ez okozta, hogy a körzet-küszöbök korábban nem jelentek meg
    // (lásd a hívójel nélküli `s`/`c`/`q` loop-változós ternaryk máshol a
    // kódbázisban, AZOK jól működnek, mert nem `repository`-val kezdődnek).
    let zoneThresholds = diploma.zoneThresholds || {};
    self.repository.zoneHomeValue = zoneThresholds.home == null ? '' : zoneThresholds.home;
    self.repository.zoneEuValue = zoneThresholds.eu == null ? '' : zoneThresholds.eu;
    self.repository.zoneDxValue = zoneThresholds.dx == null ? '' : zoneThresholds.dx;

    // Beadás-CTA állapota (6. lépés, lásd controllers/submissions.js) — csak
    // bejelentkezett usernél és STANDARD diplománál releváns (challenge típusnál
    // marad a "hamarosan elérhető" szöveg, lásd a challengeInfo fenti kommentjét,
    // mert a challenge saját jelentkezési folyamata még nincs megépítve).
    if (self.user && diploma.type !== 'challenge') {
        self.repository.ctaState = await resolveSubmitCtaState(diploma, self.user);
    }

    self.view('detail');
}

// Statisztika-oldal: kik szerezték meg ténylegesen ezt a diplomát (lásd
// OWNED_STATUSES). Régiónkénti (Hazai/EU/DX) összesítés a TELJES (nem
// lapozott) állományból, alatta a hívójel-lista lapozva (`?page=N`,
// SZÁNDÉKOSAN nem JS-es/fetch-es admin-mintájú lapozás, mert ez az oldal is
// szerver-oldalon renderelt, mint a többi diplomas-public route).
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

    // A régiónkénti összesítéshez a TELJES (nem lapozott) állomány kell —
    // ehhez elég a userId, a zóna az applikáns JELENLEGI országa alapján, ÉLŐBEN
    // számolva (lásd classifyZone lent), NEM a beadáskor eltárolt
    // `autoCheckDetails.zone`-ból: utóbbi csak `ruleMode:'points'` diplománál
    // létezik egyáltalán (lásd modules/rule-engine.js evaluateChecklist-je,
    // ami NEM ír zónát), így checklist-módú diplománál is tudunk régiónkénti
    // bontást mutatni ezzel a megoldással.
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

// Egy ország kódot Hazai/EU/DX-be sorol a diploma `homeCountry`-jához képest
// — ÉLŐ (a user JELENLEGI `country` mezője alapján) osztályozás, szándékosan
// KÜLÖN másolat a modules/rule-engine.js `determineZone()`-jától (az ottani
// modul-privát, nem exportált, ÉS a beadáskori, FAGYASZTOTT országot
// osztályozza — itt a mindenkori, aktuális besorolás kell egy statisztikai
// összesítéshez, ez a két cél szándékosan eltér).
function classifyZone(applicantCountry, homeCountry) {
    let country = String(applicantCountry || '').toUpperCase();
    let home = String(homeCountry || '').toUpperCase();

    if (home && country === home)
        return 'home';

    return COUNTRIES.isEU(country) ? 'eu' : 'dx';
}

// A statisztika-oldal tetején lévő Hazai/EU/DX összesítést adja vissza — egy
// batch `$in`-lekérdezéssel oldja fel az érintett userId-kat országra, majd
// JS-ben tálalja (nincs itt szükség Mongo aggregation pipeline-ra, a
// darabszám ritkán haladja meg a néhány százat egy diplománként).
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

// A lapozott lista aktuális oldalához tartozó beadványokra rápakolja az
// applikáns hívójelét/országát — ugyanaz a batch `$in`-join minta, mint a
// controllers/submissions.js attachApplicantInfo()-ja (szándékosan külön
// másolat, lásd az attachManagerInfo() fenti kommentjét ugyanerről).
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

// Egy statisztika-lista-sor megjelenítésre kész alakja. A pontszám a VÉGLEGES
// (esetleges kézi korrekció utáni) `submission.totalPoints`, DE a
// kategória/fokozat-címke ugyanabból a beadáskori `autoCheckDetails.categories`
// pillanatképből jön, mint a ténylegesen kiadott bizonyítványé (lásd
// schemas/submissions/submissions.js buildCertificateFieldValues()) — ez
// SZÁNDÉKOS: a statisztika a ténylegesen NYOMTATOTT fokozatot mutassa, ne egy
// utólag, a korrigált pontszámból újraszámolt (attól esetleg eltérő) értéket.
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

// Lásd a fenti komment — visszaadja, hogy a "Jelentkezés" szekció melyik ágát
// mutassa a view: 'expired' (lejárt határidő), 'existing' (már van blokkoló
// beadványa, lásd controllers/submissions.js NON_BLOCKING_STATUSES-ét — ez a
// szabály itt szándékosan duplikálva, hogy a publikus oldal is konzisztensen
// jelezze), vagy 'submit' (megjelenhet a beadás-gomb).
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

// A típus- és "meg nem szerzett"-szűrő gombjainak/linkjeinek URL-jét építi fel
// — mindkét szűrő EGYSZERRE, egymást megtartva legyen kombinálható (pl. a
// típus-gombra kattintva a "csak meg nem szerzett" pipa NE vesszen el, és
// fordítva), ugyanabban a JS nélküli, link-alapú szellemben, mint az eddigi
// típus-szűrő.
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

// Ugyanaz a feloldás, mint schemas/diplomas/diplomas.js attachManagerInfo-ja —
// szándékosan külön másolat (nem export/require a schema-ból), mert a schema
// fájl NEWSCHEMA-regisztrációt futtat betöltéskor, amit controller-ből nem
// akarunk újra kiváltani; ez a pár soros duplikáció olcsóbb, mint egy közös
// modulba kiszervezni egy ilyen kis segédfüggvényt.
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

// A bejelentkezett user "megvan"/"elbírálás alatt" jelzését adja vissza
// diplomaId -> 'owned'|'inprogress' térképként, egy lekérdezésből a lista
// összes diplomájára (nem diplománként külön, lásd resolveSubmitCtaState-et
// a detail nézetben, ami egyetlen diplomára fut, ott nem kellett batch-elni).
// Ha egy usernek több beadványa is van ugyanarra a diplomára (pl. korábban
// elutasítva, majd újra beadva), az OWNED_STATUSES mindig felülírja az
// `inprogress`-t — a végeredmény számít, nem a beadás sorrendje.
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

    // "Pecsét" a kártya/előnézeti kép fölött (felhasználói kérésre, az eredeti
    // opacity-alapú halványítás helyett, mert az "nem volt elég hangsúlyos"):
    // zöld, ha az oklevél ténylegesen megvan (lásd OWNED_STATUSES), piros, ha
    // a jelentkezési határidő lejárt (ÉS még nincs meg — egy megszerzett
    // oklevél a zöld pecsétet kapja akkor is, ha a diploma határideje azóta
    // lejárt, hisz azt már nem lehet/kell újra megszerezni). A lejárt-de-meg-
    // nem-szerzett esetben SZÁNDÉKOSAN nincs "Megvan" cimke — csak a pecsét
    // jelzi vizuálisan, hogy ez a diploma "lezárva".
    let stampType = ownedStatus === 'owned' ? 'owned' : (isExpired ? 'expired' : null);
    let stampLabel = stampType ? RESOURCE(language, 'diplomas.public.list.stamp.' + stampType) : null;

    return {
        id: d._id,
        name: d.name,
        isChallenge: d.type === 'challenge',
        hasImage: !!(d.blankImage && d.blankImage.watermarkedKey),
        deadlineText: deadlineText,
        // Csak rendezéshez (lásd compareListItems lent) — a "hamarosan lejár"
        // sorrend a MÉG le nem járt, konkrét határidejű diplomákat a
        // legközelebbi határidő szerint növekvő sorrendbe teszi; `null`, ha
        // folyamatos (nincs határidő) vagy már lejárt.
        deadlineTimestamp: (d.deadlineType === 'deadline' && d.deadlineDate && !isExpired) ? new Date(d.deadlineDate).getTime() : null,
        feeText: feeText,
        managerText: managerText,
        ownedStatus: ownedStatus || null,
        stampType: stampType,
        stampLabel: stampLabel
    };
}

// Felhasználói kérésre bevezetett listasorrend: elöl a "hamarosan lejáró"
// (még megszerezhető, konkrét határidejű) diplomák, a legközelebbi határidő
// szerint növekvő sorrendben; utánuk a folyamatos (határidő nélküli, még meg
// nem szerzett/nem lejárt) diplomák; utánuk a már beadott/elbírálás-alatti
// ("folyamatban") beadványok diplomái; végül a már megszerzett diplomák — a
// lejárt-de-meg-nem-szerzett ("halott", soha nem lesz belőle semmi) diplomák
// kerülnek legutolsóra. Azonos "rank"-on belül az eredeti (feltöltés dátuma
// szerinti) sorrend marad (Array.prototype.sort stabil Node.js-ben).
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

// Egy matchRules-sor emberi nyelvű leírását állítja elő. Ha a manager adott
// meg szabad szöveges "Megnevezés"-t (rule.label), az az elsődleges — ez pont
// erre a célra, a publikus megjelenítésre való (lásd diplomas.rule.label
// admin súgó-szövegét). Ha nincs, egy generikus, mező+feltétel alapú mondatot
// generálunk a resource-fájlok sablonjaiból ({field}/{value} helyettesítéssel).
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

// Egy kategória (pl. "CW") fokozat-létráját (Bronz/Ezüst/Arany, körzetenkénti
// minimum ponttal) alakítja megjelenítésre kész formára.
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
