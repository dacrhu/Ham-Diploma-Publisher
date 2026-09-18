// settings-store.js — a `settings` szinguláris dokumentum (_id: 'global') olvasása
// alapértékekkel kiegészítve. Belső (nem permission-ellenőrzött) elérés — a login
// action is ezen keresztül olvassa ki az MFA-policyt. A manager-oldali admin UI
// a schemas/settings/settings.js Settings/Settings sémán (permissions:['manager'])
// keresztül ír/olvas.
global.SETTINGS = {};

SETTINGS.DEFAULTS = {
    mfaPolicyUser: 'disabled',
    mfaPolicyManager: 'disabled',
    mfaMethodsAllowed: ['email', 'totp'],
    // Főoldal/oldalsáv testreszabása (felhasználói kérésre): egyedi logó
    // (oldalsáv teteje, minden oldalon)/cím/üdvözlő szöveg/banner (csak a
    // főoldalon) — egy nyelven tárolva, ugyanúgy, ahogy a diploma neve/leírása
    // sem fordított (lásd CLAUDE.md). Üres/null esetén a resource-fallbackre
    // esik vissza (app.name / home.intro).
    siteTitle: '',
    siteWelcomeText: '',
    siteLogo: null,
    siteBanner: null,
    // A LOCALIZE hook (definitions/02_localization.js) ezt használja, ha a
    // látogatónak sem nyelvi cookie-ja, sem ?language= query paramétere
    // nincs (pl. első látogatás) — korábban ilyenkor mindig a hardcode-olt
    // 'hu'-ra esett vissza, felhasználói kérésre lett admin-oldalon
    // állíthatóvá.
    defaultLanguage: 'hu',
    // "Kapcsolatok" oldal szabadszöveges tartalma (felhasználói kérésre) — a
    // manager/sa NYERS HTML-t ír be (nincs mezőnkénti struktúra, "mindenki
    // kitölti, ahogy akarja"), amit a public `/contacts` oldal VÁLTOZTATÁS
    // NÉLKÜL, escapelés nélkül jelenít meg (lásd views/contacts.html
    // `@{!repository.contactsHtml}` — a `!` előtag kapcsolja ki a Total.js
    // view-motor alapértelmezett auto-escape-jét). Ez SZÁNDÉKOS, elfogadott
    // XSS-kockázat: kizárólag manager/sa jogosultsággal szerkeszthető (lásd
    // schemas/settings/settings.js save action permissions:['manager']),
    // ugyanaz a bizalmi kör, mint pl. a diploma-overlay vagy a bankszámla-
    // adatok szerkesztése — nem felhasználói bemenet.
    contactsHtml: ''
};

// A `layout.html` (oldalsáv logó/cím) MINDEN oldalon renderelődik, nem csak a
// home controlleren keresztül — ehhez egy globális, SZINKRON `ON('controller')`
// hook kell (lásd definitions/12_site_branding.js), aminek nincs módja
// megvárni egy DB-hívást. Ezért itt egy egyszerű, memóriabeli cache-t tartunk:
// a hook ezt (`SETTINGS.cache`) olvassa közvetlenül, DB-hívás NÉLKÜL, minden
// requestnél — a cache-t induláskor (`ON('ready')`) és minden mentés/feltöltés
// UTÁN azonnal frissítjük (lásd SETTINGS.invalidate), hogy sose legyen
// érezhetően elavult.
SETTINGS.cache = null;

SETTINGS.get = async function () {
    if (SETTINGS.cache)
        return Object.assign({}, SETTINGS.cache);

    let doc = await MDB.findOne(process.env.MONGODB_DB_NAME, 'settings', { _id: 'global' });

    SETTINGS.cache = (!doc || Array.isArray(doc)) ? Object.assign({}, SETTINGS.DEFAULTS) : Object.assign({}, SETTINGS.DEFAULTS, doc);
    return Object.assign({}, SETTINGS.cache);
};

// A settings mentés/logó/banner-feltöltés hívja meg a DB-írás UTÁN, hogy a
// cache (és vele a szinkron `ON('controller')` hook) azonnal friss adatot
// lásson — nem várunk semmilyen TTL-re.
SETTINGS.invalidate = async function () {
    SETTINGS.cache = null;
    await SETTINGS.get();
};

// Adott user (sa / manager permission / sima rádióamatőr) szerepköréhez tartozó
// MFA-policy kiválasztása.
SETTINGS.mfaPolicyFor = function (settings, user) {
    let isManagerRole = !!(user && (user.sa || (user.permissions || []).indexOf('manager') !== -1));
    return isManagerRole ? settings.mfaPolicyManager : settings.mfaPolicyUser;
};
