// certificate-renderer.js — Puppeteer-based renderer: burns the positioned
// text fields (overlayFields) and/or a "MINTA / SAMPLE" watermark onto the
// blank diploma image into an ACTUALLY generated JPEG (not just a CSS overlay
// in the browser — this way the original file never leaves via a route
// reachable by a non-manager without a watermark/without being filled in).
//
// This same mechanism will also power milestone 4's final PDF certificate
// generator (with a page.pdf() call instead of a screenshot, with real
// submission data, without a watermark) — that's why the field positioning
// (top/left % + align) is implemented in one place here, not duplicated in
// the PDF generator.
//
// From step 11 (cloud storage) onward, the caller passes in an ALREADY READ
// Buffer (`STORAGE.read(key)`), NOT a local file path — this way this module
// is storage-driver-independent (S3 has no concept of a "local file path").
// The original file name (`imageName`) is only used to determine the
// extension (MIME type), the content is never read back from it.
const PATHMOD = require('path');

global.CERT_RENDERER = {};

// At the user's request (2025 session): "all data fields should have the same
// font size" — the font size is NOT per-field (it used to be, but there was
// never an admin UI for it, only the DEFAULT_OVERLAY_FIELDS initial values),
// but a DIPLOMA-level uniform size (schemas/diplomas/diplomas.js
// `overlayFontSize`) — every field is displayed with the same size. The font
// (family) is also diploma-level, from a closed, curated list
// (`overlayFontFamily`) — NOT free text, because the font actually has to be
// installed on the server (see docker/Dockerfile.dev), otherwise Puppeteer
// would silently fall back to a system default. The keys (left side) are the
// value stored in the diploma document; the right side is the CSS font-family
// list passed to Chromium (with fallbacks, in case the primary font still
// isn't available). IMPORTANT: font names must use SINGLE quotes (not double)
// — these CSS `font-family` values get interpolated into an HTML
// `style="..."` attribute (see buildHtml below), which is ITSELF
// double-quoted; an embedded `"Dancing Script"` would literally close the
// attribute right at the font-family part, and every declaration after it
// (e.g. `color`) would silently get lost — this was exactly this bug (the
// font and every style after it silently got ignored, only font-size took
// effect, because it comes earlier in the chain).
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

// Shared logic between the draggable admin marker (public/css/custom.css
// .overlay-field-handle) and the actual render: the anchor (transform)
// depends on `align` — left: the text grows to the right from the position,
// center: around the position, right: grows to the left from the position
// (this latter two matter so that fields dragged to the edge of the image —
// e.g. serial number bottom-left, date bottom-right — don't hang off the
// image).
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

    // The wrapper div is INTENTIONALLY `display:block` (NOT `inline-block`) —
    // without this, an `inline-block` wrapper, even if the <img> inside it is
    // itself `display:block`, leaves a few-pixel "strut" gap at the bottom of
    // the body (due to the normal line-height of the body's inline formatting
    // context, even when the content itself consists only of block-level
    // elements) — this is UNNOTICEABLE in screenshot mode (page.screenshot()
    // simply crops content beyond the viewport), but for PDF export
    // (page.pdf()) it prints the full document height, so this handful of
    // pixels resulted in an almost empty SECOND PDF page (concretely
    // reproduced: for a 1536x1024px image, body.scrollHeight became 1028px
    // instead of 1024).
    return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;">
        <div style="position:relative;display:block;">
            <img id="baseimg" src="${imageDataUri}" style="display:block;">
            ${fieldsHtml}
            ${watermarkHtml}
        </div>
    </body></html>`;
}

// Shared part between render()/renderPdf(): launches Chromium, loads the
// HTML, and sets the viewport to the ACTUAL pixel size of the loaded blank
// image (both the screenshot and the PDF export rely on this same
// pixel-accurate size, so that the overlay-positioning % coordinates land in
// exactly the same place as what the admin saw with the draggable markers).
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

// imageBuffer: the RAW content of the blank image (Buffer — read in by the
// caller with `STORAGE.read(key)`, driver-independent). imageName: only
// needed to determine the extension (MIME type) (e.g. the storage key or the
// original file name). overlayFields: [{key,top,left,align}] (fontSize is NOT
// per-field, see above). fieldValues: {key: text} — only the keys actually
// given are displayed, missing ones are left out (no error). watermark: if
// true, a large, translucent "MINTA / SAMPLE" caption is also added on top
// of/alongside the above (this ALWAYS has its own fixed style — it doesn't use
// the `data` fields' uniform font/size, because this is a system-generated
// stamp, not content). fontFamilyKey: one of the FONT_FAMILIES keys (falls
// back to DEFAULT_FONT_FAMILY if invalid/missing). fontSize: px, falls back to
// DEFAULT_FONT_SIZE if missing/invalid. Return value: JPEG Buffer.
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

// Same as render(), but returns a REAL PDF (not a screenshot) and NEVER adds
// a watermark — this is step 9's (M4) final certificate generator: with the
// submission's actual data (fieldValues), without a watermark. The PDF page
// size is set pixel-accurately to the loaded blank image's size (the same way
// as the viewport for the screenshot), so that the overlay-positioning %
// coordinates land in exactly the same place here too. Return value: PDF Buffer.
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
