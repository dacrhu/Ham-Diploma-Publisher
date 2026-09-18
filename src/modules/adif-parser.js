// adif-parser.js — saját minimál ADIF (.adi/.adif) napló-parser (CLAUDE.md
// minimális dependencia elve: nem veszünk fel npm csomagot egy ilyen kis,
// jól körülhatárolt feladatra).
//
// ADIF formátum: `<FIELDNAME:LENGTH[:TYPE]>value` tag-ek egymás után, egy
// rekord (QSO) végét a `<eor>` tag jelzi (case-insensitive), a fájl elején
// opcionálisan egy fejléc áll (a `<eoh>` tag-ig, ha egyáltalán van — sok
// egyszerű napló fejléc nélkül, közvetlenül QSO-kkal kezdődik). A LENGTH a
// value karakterhossza — ASCII/latin naplóknál ez megegyezik a substring
// hosszával, ez a leegyszerűsítés (nem bájt-pontos UTF-8 hossz) a "minimál
// parser" szándékos korlátja, ugyanúgy, ahogy pl. a modules/adif-modes.js is
// csak a gyakori eseteket fedi le teljes ADIF-enumeráció helyett.
//
// A rule-engine (lásd modules/rule-engine.js) ezt a modult használja a
// beadott napló QSO-kra bontásához, mielőtt a diploma matchRules-eit
// kiértékelné rajtuk.
global.ADIF_PARSER = {};

const TAG_RE = /<([a-zA-Z_][a-zA-Z0-9_]*):(\d+)(:[^>]*)?>/g;

// text: a feltöltött .adi/.adif fájl tartalma (string). Visszaad egy QSO-tömböt
// (eredeti, a fájlban szereplő sorrendben) — minden elem a nyers ADIF mezőket
// NAGYBETŰS kulcsokkal tartalmazza (`raw`), plusz a rule-engine-nek kényelmes,
// normalizált mezőket: `call` (upper), `band` (lower), `mode` (upper),
// `comment`, `qth`, `propMode` (upper, PROP_MODE-ból — lásd rule-engine.js
// komment az átjátszó-detektálásról), `qsoDate` (Date, QSO_DATE+TIME_ON-ból,
// hiányzó/hibás bemenetnél `null`). Parse-olhatatlan/üres bemenetnél üres
// tömböt ad vissza — nem dob kivételt, a hívó (controller) dönti el, hogy 0
// QSO hibának számít-e (lásd error.submission.file.empty).
ADIF_PARSER.parse = function (text) {
    if (!text || typeof text !== 'string')
        return [];

    // A fejléc (ha van) a <eoh> tag-ig tart — utána kezdődnek a QSO-rekordok.
    // Case-insensitive keresés, mert az ADIF tag-nevek nem kis/nagybetű-érzékenyek.
    let eohIndex = text.search(/<eoh>/i);
    let body = eohIndex === -1 ? text : text.slice(eohIndex + 5);

    let records = body.split(/<eor>/i);
    let qsos = [];

    for (let i = 0, n = records.length; i < n; i++) {
        let record = parseRecord(records[i]);

        // Üres/csak whitespace rekordot (pl. az utolsó <eor> utáni maradék)
        // átugorjuk — nem egy valódi QSO.
        if (!record)
            continue;

        qsos.push(record);
    }

    return qsos;
};

function parseRecord(chunk) {
    let raw = {};
    TAG_RE.lastIndex = 0;

    let match;
    let found = false;

    while ((match = TAG_RE.exec(chunk)) !== null) {
        let name = match[1].toUpperCase();
        let length = Number(match[2]);
        let start = TAG_RE.lastIndex;
        let value = chunk.substr(start, length);

        raw[name] = value;
        found = true;

        // A regex `lastIndex`-ét a beolvasott érték után kell folytatni, nem a
        // tag-utáni pozíción (ami csak a `>` után van, a value előtt) — a
        // `exec` a saját `lastIndex`-éből indul legközelebb, ezt kell átállítani.
        TAG_RE.lastIndex = start + length;
    }

    if (!found)
        return null;

    return {
        raw: raw,
        call: (raw.CALL || '').trim().toUpperCase(),
        band: (raw.BAND || '').trim().toLowerCase(),
        mode: (raw.MODE || '').trim().toUpperCase(),
        comment: (raw.COMMENT || '').trim(),
        qth: (raw.QTH || '').trim(),
        propMode: (raw.PROP_MODE || '').trim().toUpperCase(),
        qsoDate: parseQsoDate(raw.QSO_DATE, raw.TIME_ON)
    };
}

// QSO_DATE: "YYYYMMDD", TIME_ON: "HHMM" vagy "HHMMSS" — mindkettő ADIF-konvenció
// szerinti, fix hosszú számjegy-string. Hiányzó/hibás bemenetnél `null` (a
// rule-engine duplikátum-kronológiája ilyenkor az eredeti napló-sorrendre esik
// vissza, lásd ott).
function parseQsoDate(dateStr, timeStr) {
    if (!dateStr || dateStr.length !== 8)
        return null;

    let year = Number(dateStr.substr(0, 4));
    let month = Number(dateStr.substr(4, 2));
    let day = Number(dateStr.substr(6, 2));

    let hour = 0, minute = 0, second = 0;
    if (timeStr && (timeStr.length === 4 || timeStr.length === 6)) {
        hour = Number(timeStr.substr(0, 2));
        minute = Number(timeStr.substr(2, 2));
        second = timeStr.length === 6 ? Number(timeStr.substr(4, 2)) : 0;
    }

    let date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    return isNaN(date.getTime()) ? null : date;
}
