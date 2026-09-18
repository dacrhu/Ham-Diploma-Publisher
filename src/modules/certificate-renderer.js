// certificate-renderer.js — Puppeteer-alapú renderelő: a biankó diploma-képre
// pozicionált szöveg-mezőket (overlayFields) és/vagy egy "MINTA / SAMPLE"
// vízjelet éget bele egy TÉNYLEGESEN legenerált JPEG-be (nem csak CSS-overlay
// a böngészőben — az eredeti fájl így soha nem kerül ki vízjel/kitöltés nélkül
// olyan útvonalon, amit nem-manager is elérhet).
//
// Ugyanez a mechanizmus adja a 4. mérföldkő végleges PDF oklevél-generátorát
// is (page.pdf() hívással screenshot helyett, valós beadvány-adatokkal
// watermark nélkül) — ezért a mezőpozicionálás (top/left % + align) itt van
// egy helyen implementálva, nem duplikálva a PDF-generátorban.
//
// A 11. lépéstől (felhős tárhely) a hívó egy MÁR BEOLVASOTT Buffert ad át
// (`STORAGE.read(key)`), NEM egy helyi fájl elérési útját — így ez a modul
// storage-driver-független (S3-nál nincs "helyi elérési út" fogalom). Az
// eredeti fájlnevet (`imageName`) csak a kiterjesztés (MIME-típus)
// megállapításához használjuk, a tartalmat sose olvassuk vissza belőle.
const PATHMOD = require('path');

global.CERT_RENDERER = {};

// Felhasználói kérésre (2025-ös session): "minden adat betűmérete legyen
// ugyanakkora" — a betűméret NEM mezőnkénti (korábban az volt, de sosem volt
// hozzá admin UI, csak a DEFAULT_OVERLAY_FIELDS induló értékei), hanem egy
// DIPLOMA-szintű egységes méret (schemas/diplomas/diplomas.js
// `overlayFontSize`) — minden mező ugyanazzal a mérettel jelenik meg. A font
// (család) is diploma-szintű, egy zárt, kurált listából (`overlayFontFamily`)
// — NEM szabad szöveg, mert a szervernek ténylegesen telepítve kell lennie a
// fontnak (lásd docker/Dockerfile.dev), különben Puppeteer csöndben egy
// rendszer-alapértelmezettre esne vissza. A kulcsok (bal oldal) a diploma
// dokumentumban tárolt érték; a jobb oldal a Chromiumnak átadott CSS
// font-family lista (fallback-ekkel, ha a fő betűtípus mégsem lenne elérhető).
// FONTOS: a font-nevekhez EGYES idézőjel kell (nem kettős) — ezek a CSS
// `font-family` értékek egy HTML `style="..."` attribútumba kerülnek
// interpolálva (lásd buildHtml lent), ami MAGA is kettős idézőjeles; egy
// beágyazott `"Dancing Script"` szó szerint lezárná az attribútumot a
// font-family résznél, és minden utána lévő deklaráció (pl. `color`) némán
// elveszne — ez pontosan ez a hiba volt (a betűtípus és minden utána lévő
// stílus csendben figyelmen kívül maradt, csak a font-size érvényesült,
// mert az korábban van a láncban).
CERT_RENDERER.FONT_FAMILIES = {
    'liberation-sans': "'Liberation Sans', Arial, sans-serif",
    'liberation-serif': "'Liberation Serif', 'Times New Roman', serif",
    'eb-garamond': "'EB Garamond', Garamond, serif",
    'dancing-script': "'Dancing Script', cursive"
};
CERT_RENDERER.DEFAULT_FONT_FAMILY = 'liberation-serif';
CERT_RENDERER.DEFAULT_FONT_SIZE = 24;

const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

function escapeHtml(text) {
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// A dragozható admin-jelölő (public/css/custom.css .overlay-field-handle) és a
// tényleges render KÖZÖS logikája: az anchor (transform) a `align`-től függ —
// left: a szöveg a pozíciótól jobbra nő, center: a pozíció köré, right: a
// pozíciótól balra nő (ez utóbbi kettő azért fontos, hogy a kép szélére húzott
// mezők — pl. sorszám balra lent, dátum jobbra lent — ne lógjanak ki a képből).
function anchorTransform(align) {
    if (align === 'left') return 'translateY(-50%)';
    if (align === 'right') return 'translate(-100%, -50%)';
    return 'translate(-50%, -50%)';
}

function buildHtml(imageDataUri, overlayFields, fieldValues, watermark, fontFamilyCss, fontSize) {
    let fieldsHtml = '';

    for (let i = 0, n = overlayFields.length; i < n; i++) {
        let f = overlayFields[i];
        let value = fieldValues[f.key];

        if (value == null || value === '')
            continue;

        fieldsHtml += `<div style="position:absolute;top:${f.top}%;left:${f.left}%;transform:${anchorTransform(f.align)};font-size:${fontSize}px;text-align:${f.align};white-space:nowrap;font-family:${fontFamilyCss};color:#000;">${escapeHtml(value)}</div>`;
    }

    let watermarkHtml = watermark
        ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:9vw;font-weight:700;color:rgba(0,0,0,0.18);transform:rotate(-30deg);white-space:nowrap;font-family:Arial,sans-serif;">MINTA / SAMPLE</div>`
        : '';

    // A wrapper div SZÁNDÉKOSAN `display:block` (NEM `inline-block`) — enélkül
    // egy `inline-block` wrapper, még ha a benne lévő <img> maga `display:block`
    // is, egy pár pixeles "strut" rést hagy a body alján (a body inline
    // formázási kontextusának normál sor-magassága miatt, még akkor is, ha a
    // tartalom maga csak block-szintű elemekből áll) — ez screenshot módban
    // ÉSZREVÉTLEN (page.screenshot() simán levágja a viewporton túli
    // tartalmat), de PDF exportnál (page.pdf()) a teljes dokumentum-magasságot
    // nyomtatja, ezért ez a pár pixel egy csaknem üres MÁSODIK PDF-oldalt
    // eredményezett (konkrétan reprodukálva: 1536x1024px kép esetén
    // body.scrollHeight 1028px lett 1024 helyett).
    return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;">
        <div style="position:relative;display:block;">
            <img id="baseimg" src="${imageDataUri}" style="display:block;">
            ${fieldsHtml}
            ${watermarkHtml}
        </div>
    </body></html>`;
}

// Közös rész render()/renderPdf() között: elindítja a Chromiumot, betölti a
// HTML-t, és a betöltött biankó kép TÉNYLEGES pixelméretére állítja a
// viewportot (mind a screenshot, mind a PDF-export ugyanerre a pixel-pontos
// méretre támaszkodik, hogy az overlay-pozicionáló % koordinátái pontosan
// ugyanoda essenek, mint amit az admin a húzható jelölőkkel látott).
async function launchAndSize(html) {
    const puppeteer = require('puppeteer');
    let browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox']
    });

    try {
        let page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'load' });

        let size = await page.evaluate(function () {
            let img = document.getElementById('baseimg');
            return { width: img.naturalWidth, height: img.naturalHeight };
        });

        await page.setViewport({ width: size.width, height: size.height });

        return { browser: browser, page: page, size: size };
    } catch (e) {
        await browser.close();
        throw e;
    }
}

function toImageDataUri(imageBuffer, imageName) {
    let ext = PATHMOD.extname(imageName || '').replace('.', '').toLowerCase();
    let mime = MIME_BY_EXT[ext] || 'image/jpeg';
    return `data:${mime};base64,${imageBuffer.toString('base64')}`;
}

function resolveFontFamilyCss(fontFamilyKey) {
    return CERT_RENDERER.FONT_FAMILIES[fontFamilyKey] || CERT_RENDERER.FONT_FAMILIES[CERT_RENDERER.DEFAULT_FONT_FAMILY];
}

function resolveFontSize(fontSize) {
    return Number(fontSize) > 0 ? Number(fontSize) : CERT_RENDERER.DEFAULT_FONT_SIZE;
}

// imageBuffer: a biankó kép NYERS tartalma (Buffer — a hívó olvassa be
// `STORAGE.read(key)`-vel, driver-független). imageName: csak a kiterjesztés
// (MIME-típus) megállapításához kell (pl. a storage-kulcs vagy az eredeti
// fájlnév). overlayFields: [{key,top,left,align}] (fontSize NINCS mezőnként,
// lásd fent). fieldValues: {key: szöveg} — csak a ténylegesen megadott
// kulcsok jelennek meg, a hiányzók kimaradnak (nincs hiba). watermark: true
// esetén a fentiek mellé/fölé egy nagy, áttetsző "MINTA / SAMPLE" felirat is
// bekerül (ez MINDIG saját, fix stílusú — nem az `adat`-mezők egységes
// fontját/méretét használja, mert ez egy rendszer-generált bélyegző, nem
// tartalom). fontFamilyKey: a FONT_FAMILIES egyik kulcsa (érvénytelen/hiányzó
// esetén DEFAULT_FONT_FAMILY). fontSize: px, hiányzó/érvénytelen esetén
// DEFAULT_FONT_SIZE. Visszatérési érték: JPEG Buffer.
CERT_RENDERER.render = async function (imageBuffer, imageName, overlayFields, fieldValues, watermark, fontFamilyKey, fontSize) {
    let imageDataUri = toImageDataUri(imageBuffer, imageName);
    let html = buildHtml(imageDataUri, overlayFields || [], fieldValues || {}, !!watermark, resolveFontFamilyCss(fontFamilyKey), resolveFontSize(fontSize));

    let { browser, page } = await launchAndSize(html);

    try {
        return await page.screenshot({ type: 'jpeg', quality: 90 });
    } finally {
        await browser.close();
    }
};

// Ugyanaz, mint a render(), de VALÓDI PDF-et ad vissza (nem screenshotot) és
// SOSE tesz rá vízjelet — ez a 9. lépés (M4) végleges oklevél-generátora: a
// beadvány tényleges adataival (fieldValues), watermark nélkül. A PDF oldalmérete
// pixelre pontosan a betöltött biankó kép méretére van állítva (ugyanúgy, mint a
// screenshotnál a viewport), hogy az overlay-pozicionáló % koordinátái itt is
// pontosan ugyanoda essenek. Visszatérési érték: PDF Buffer.
CERT_RENDERER.renderPdf = async function (imageBuffer, imageName, overlayFields, fieldValues, fontFamilyKey, fontSize) {
    let imageDataUri = toImageDataUri(imageBuffer, imageName);
    let html = buildHtml(imageDataUri, overlayFields || [], fieldValues || {}, false, resolveFontFamilyCss(fontFamilyKey), resolveFontSize(fontSize));

    let { browser, page, size } = await launchAndSize(html);

    try {
        await page.emulateMediaType('screen');

        return await page.pdf({
            width: size.width + 'px',
            height: size.height + 'px',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        });
    } finally {
        await browser.close();
    }
};
