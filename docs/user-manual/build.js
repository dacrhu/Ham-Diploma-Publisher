#!/usr/bin/env node
/**
 * Ham Diploma Publisher user manual - build script
 * (following the pattern of EHS4's docs/user-manual/build.js, see
 * /home/berci/GIT/GITEA/EHS/ehs4/docs/user-manual/build.js).
 *
 * Merges the human-written text content in ./content/*.js and the
 * screenshots generated under ../../tools/screenshot-doc/output into
 * standalone, single-file HTML documents (docs/user-manual/*.html). The
 * images are embedded as base64, so every .html file can be opened on its
 * own, without a server, in any browser.
 *
 * Run: node docs/user-manual/build.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CONTENT_DIR = path.join(__dirname, 'content');
const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'tools', 'screenshot-doc', 'output');
const OUT_DIR = __dirname;

function imageDataUri(relPath) {
    const full = path.join(SCREENSHOT_DIR, relPath + '.png');
    if (!fs.existsSync(full)) {
        console.log(`  ! missing image: ${relPath}.png`);
        return null;
    }
    const b64 = fs.readFileSync(full).toString('base64');
    return `data:image/png;base64,${b64}`;
}

const STYLE = `
:root {
    --accent: #2269d3;
    --accent-light: #e8f0fc;
    --text: #24292e;
    --text-muted: #57606a;
    --border: #d8dee4;
    --bg: #ffffff;
    --bg-alt: #f6f8fa;
}
* { box-sizing: border-box; }
body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.55;
}
header.page-header {
    background: var(--accent);
    color: #fff;
    padding: 18px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
}
header.page-header a {
    color: #fff;
    text-decoration: none;
    font-size: 0.9em;
    opacity: 0.9;
}
header.page-header a:hover { text-decoration: underline; }
header.page-header h1 { margin: 0; font-size: 1.3em; }
main {
    max-width: 880px;
    margin: 0 auto;
    padding: 24px 32px 64px;
}
.intro {
    font-size: 1.05em;
    color: var(--text-muted);
    margin-bottom: 28px;
}
nav.toc {
    background: var(--bg-alt);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 20px;
    margin-bottom: 32px;
}
nav.toc strong { display: block; margin-bottom: 6px; }
nav.toc ul { margin: 0; padding-left: 20px; }
nav.toc li { margin: 2px 0; }
nav.toc a { color: var(--accent); text-decoration: none; }
nav.toc a:hover { text-decoration: underline; }
section.page-section {
    margin-bottom: 40px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
}
section.page-section:first-of-type { border-top: none; }
h2 { color: var(--accent); font-size: 1.25em; margin-top: 0; }
h2 .step-badge {
    display: inline-block;
    background: var(--accent-light);
    color: var(--accent);
    border-radius: 999px;
    width: 1.6em;
    height: 1.6em;
    text-align: center;
    line-height: 1.6em;
    font-size: 0.7em;
    margin-right: 8px;
    vertical-align: middle;
}
p { margin: 0.6em 0; }
ul, ol { padding-left: 22px; }
strong.ui { color: var(--accent); }
code {
    background: var(--bg-alt);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 0.92em;
}
.screenshot {
    margin: 14px 0 6px;
    text-align: center;
}
.screenshot img {
    max-width: 100%;
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.08);
}
.screenshot .caption {
    color: var(--text-muted);
    font-size: 0.85em;
    margin-top: 6px;
}
.callout {
    background: var(--accent-light);
    border-left: 4px solid var(--accent);
    border-radius: 4px;
    padding: 10px 16px;
    margin: 14px 0;
    font-size: 0.95em;
}
.callout strong { color: var(--accent); }
.card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 16px;
    margin-top: 24px;
}
.card {
    display: block;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 18px;
    text-decoration: none;
    color: var(--text);
    background: var(--bg-alt);
    transition: box-shadow 0.15s, transform 0.15s;
}
.card:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.1); transform: translateY(-1px); }
.card h3 { margin: 0 0 6px; color: var(--accent); font-size: 1.05em; }
.card p { margin: 0; color: var(--text-muted); font-size: 0.9em; }
footer.page-footer {
    max-width: 880px;
    margin: 0 auto;
    padding: 0 32px 40px;
    color: var(--text-muted);
    font-size: 0.85em;
}
@media print {
    header.page-header { background: none !important; color: var(--text) !important; }
    header.page-header a { display: none; }
    nav.toc { break-inside: avoid; }
    section.page-section { break-inside: avoid-page; }
    .screenshot img { box-shadow: none; }
}
@media (prefers-color-scheme: dark) {
    :root {
        --accent: #6fa3ea;
        --accent-light: #182742;
        --text: #e6edf3;
        --text-muted: #9aa7b1;
        --border: #333b42;
        --bg: #0d1117;
        --bg-alt: #161b22;
    }
}
`;

function renderShell({ title, backLink, backLabel, bodyHtml }) {
    return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
<header class="page-header">
    <h1>${title}</h1>
    ${backLink ? `<a href="${backLink}">← ${backLabel}</a>` : ''}
</header>
<main>
${bodyHtml}
</main>
<footer class="page-footer">Ham Diploma Publisher user manual</footer>
</body>
</html>
`;
}

function renderScreenshot(imgKey, caption) {
    const uri = imageDataUri(imgKey);
    if (!uri) return `<div class="callout"><strong>Missing image:</strong> ${imgKey}</div>`;
    return `<div class="screenshot">
    <img src="${uri}" alt="${caption || ''}" loading="lazy">
    ${caption ? `<div class="caption">${caption}</div>` : ''}
</div>`;
}

function renderSection(sec, index) {
    const imgHtml = sec.image ? renderScreenshot(sec.image, sec.caption) : '';
    const bodyHtml = (sec.body || []).join('\n');
    return `<section class="page-section" id="${sec.id || 'sec-' + index}">
    <h2><span class="step-badge">${index}</span>${sec.heading}</h2>
    ${bodyHtml}
    ${imgHtml}
</section>`;
}

function renderPage(mod) {
    const toc = `<nav class="toc"><strong>Contents</strong><ul>${mod.sections
        .map((s, i) => `<li><a href="#${s.id || 'sec-' + (i + 1)}">${s.heading}</a></li>`)
        .join('')}</ul></nav>`;
    const intro = `<p class="intro">${mod.intro}</p>`;
    const sections = mod.sections.map((s, i) => renderSection(s, i + 1)).join('\n');
    return renderShell({
        title: mod.title,
        backLink: 'index.html',
        backLabel: 'Back to overview',
        bodyHtml: intro + toc + sections,
    });
}

function renderIndexPage(indexDef) {
    const cards = indexDef.pages
        .map(
            (p) => `<a class="card" href="${p.file}">
    <h3>${p.title}</h3>
    <p>${p.desc}</p>
</a>`
        )
        .join('\n');
    const bodyHtml = `<p class="intro">${indexDef.intro}</p>
<div class="card-grid">
${cards}
</div>`;
    return renderShell({ title: indexDef.title, bodyHtml });
}

function main() {
    // Content files ordered by their numeric prefix (e.g. 00-general.js,
    // 01-radio-amateur.js, 02-manager.js) - the order determines the
    // doc/index order, the output filename is determined by the module's
    // own "slug" field.
    const files = fs
        .readdirSync(CONTENT_DIR)
        .filter((f) => f.endsWith('.js') && f !== 'index.js')
        .sort();
    const pages = [];

    for (const f of files) {
        const mod = require(path.join(CONTENT_DIR, f));
        const outName = `${mod.slug}.html`;
        const html = renderPage(mod);
        fs.writeFileSync(path.join(OUT_DIR, outName), html, 'utf8');
        console.log(`  ✓ ${outName}`);
        pages.push({ file: outName, title: mod.navTitle || mod.title, desc: mod.navDesc || '' });
    }

    const indexDef = require(path.join(CONTENT_DIR, 'index.js'));
    indexDef.pages = pages;
    fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderIndexPage(indexDef), 'utf8');
    console.log('  ✓ index.html');
}

main();
