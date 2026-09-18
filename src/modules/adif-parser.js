// adif-parser.js — our own minimal ADIF (.adi/.adif) log parser (CLAUDE.md's
// minimal-dependency principle: we don't add an npm package for such a small,
// well-scoped task).
//
// ADIF format: a sequence of `<FIELDNAME:LENGTH[:TYPE]>value` tags, the end
// of a record (QSO) is marked by the `<eor>` tag (case-insensitive), the
// start of the file optionally has a header (up to the `<eoh>` tag, if there
// is one at all — many simple logs have no header and start directly with
// QSOs). LENGTH is the value's character length — for ASCII/Latin logs this
// matches the substring's length; this simplification (not a byte-accurate
// UTF-8 length) is an intentional limitation of the "minimal parser", the
// same way e.g. modules/adif-modes.js only covers the common cases instead
// of a full ADIF enumeration.
//
// The rule engine (see modules/rule-engine.js) uses this module to split the
// submitted log into QSOs, before evaluating the diploma's matchRules
// against them.
global.ADIF_PARSER = {};

const TAG_RE = /<([a-zA-Z_][a-zA-Z0-9_]*):(\d+)(:[^>]*)?>/g;

// text: the content of the uploaded .adi/.adif file (string). Returns an
// array of QSOs (in the original order they appear in the file) — each
// element contains the raw ADIF fields with UPPERCASE keys (`raw`), plus
// normalized fields convenient for the rule engine: `call` (upper), `band`
// (lower), `mode` (upper), `comment`, `qth`, `propMode` (upper, from
// PROP_MODE — see the rule-engine.js comment about repeater detection),
// `qsoDate` (Date, from QSO_DATE+TIME_ON, `null` for missing/invalid input).
// Returns an empty array for unparseable/empty input — doesn't throw an
// exception, the caller (controller) decides whether 0 QSOs counts as an
// error (see error.submission.file.empty).
ADIF_PARSER.parse = function (text) {
    if (!text || typeof text !== 'string')
        return [];

    // The header (if present) extends up to the <eoh> tag — the QSO records
    // start after that. Case-insensitive search, because ADIF tag names are
    // not case-sensitive.
    let eohIndex = text.search(/<eoh>/i);
    let body = eohIndex === -1 ? text : text.slice(eohIndex + 5);

    let records = body.split(/<eor>/i);
    let qsos = [];

    for (let i = 0, n = records.length; i < n; i++) {
        let record = parseRecord(records[i]);

        // Skip an empty/whitespace-only record (e.g. the remainder after the
        // last <eor>) — it's not a real QSO.
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

        // The regex's `lastIndex` must continue after the value that was read,
        // not at the position right after the tag (which is only after the
        // `>`, before the value) — `exec` starts from its own `lastIndex` next
        // time, so this needs to be adjusted.
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

// QSO_DATE: "YYYYMMDD", TIME_ON: "HHMM" or "HHMMSS" — both fixed-length digit
// strings per ADIF convention. `null` for missing/invalid input (in that
// case the rule engine's duplicate chronology falls back to the original log
// order, see there).
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
