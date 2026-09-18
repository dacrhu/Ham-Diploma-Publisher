#!/usr/bin/env node
/**
 * Screenshot generator for the Ham Diploma Publisher user manual
 * (following the pattern of EHS4's tools/screenshot-doc, see
 * /home/berci/GIT/GITEA/EHS/ehs4/).
 *
 * IMPORTANT: this targets ONLY the local dev Docker environment
 * (docker/docker-compose-dev.yml, http://127.0.0.1:8000 + mailhog at
 * http://127.0.0.1:8026). It performs a REAL login (this project has no
 * DEBUG auto-login bypass, see CLAUDE.md) and actually reads the MFA code
 * from the mailhog API. It only uses/creates the dedicated TEST accounts
 * under fixtures/ (ha3test@example.com as a radio amateur,
 * teszt.radios@example.com as a manager), a dedicated disposable test
 * diploma, and a disposable test submission they create - it never touches
 * any other, real user's account, diploma or submission.
 *
 * Prerequisite: the ha3test/teszt.radios accounts' password is known (see
 * tools/screenshot-doc/README.md) — if it has expired/changed, it can be
 * reset again through /forgot-password, via mailhog.
 *
 * Run (host node, using src/node_modules/puppeteer):
 *   node tools/screenshot-doc/shoot.js [scenario ...]
 */
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const puppeteer = require(path.join(__dirname, '..', '..', 'src', 'node_modules', 'puppeteer'));

const BASE = 'http://127.0.0.1:8000';
const MAILHOG = 'http://127.0.0.1:8026';
const OUT = path.join(__dirname, 'output');
const FIXTURES = path.join(__dirname, 'fixtures');
const VIEWPORT = { width: 1440, height: 900 };
const CHROME_CANDIDATES = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

const HAM_USER = { email: 'ha3test@example.com', password: 'TestDoc!2026xy', callsign: 'HA3TEST' };
const MANAGER_USER = { email: 'teszt.radios@example.com', password: 'TestDoc!2026xy' };

// Dedicated, disposable TEST diploma (see tools/screenshot-doc/README.md) -
// created solely for this documentation run, owned by MANAGER_USER
// (teszt.radios), so the full life cycle (submission -> QSL -> review) can
// be played through without having to modify a real diploma or submission
// (belonging to someone else). The ID is from the dev database - if the dev
// DB gets rebuilt, it needs to be recreated per the README.md.
const DEMO_DIPLOMA_ID = '6aac24822f8d36bd4045b19c';

function resolveChromePath() {
    for (const c of CHROME_CANDIDATES) {
        if (fs.existsSync(c)) return c;
    }
    return undefined;
}

function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shoot(page, subdir, name, opts) {
    const dir = path.join(OUT, subdir);
    ensureDir(dir);
    await wait((opts && opts.settle) || 250);
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
    console.log(`  ✓ ${subdir}/${name}.png`);
}

async function goto(page, urlPath) {
    await page.goto(BASE + urlPath, { waitUntil: 'networkidle0', timeout: 30000 });
}

async function safeClick(page, selector, timeout) {
    await page.waitForSelector(selector, { visible: true, timeout: timeout || 5000 });
    await page.click(selector);
}

async function run(name, fn) {
    console.log(`\n=== ${name} ===`);
    try {
        await fn();
    } catch (e) {
        console.log(`  !! ERROR (${name}): ${e.message}`);
    }
}

// ---------------------------------------------------------------------------
// Mailhog helpers - reading out the MFA code / password reset link
// ---------------------------------------------------------------------------
function httpGetJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function findLatestMail(toAddress, subjectContains) {
    const data = await httpGetJson(`${MAILHOG}/api/v2/messages?limit=25`);
    for (const item of data.items) {
        const to = item.To[0];
        const toAddr = `${to.Mailbox}@${to.Domain}`.toLowerCase();
        if (toAddr !== toAddress.toLowerCase()) continue;
        const subj = (item.Content.Headers.Subject || [''])[0];
        if (subjectContains && subj.indexOf(subjectContains) === -1) continue;
        return item;
    }
    return null;
}

async function waitForNewMail(toAddress, subjectContains, excludeId, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 10000);
    while (Date.now() < deadline) {
        const item = await findLatestMail(toAddress, subjectContains);
        if (item && item.ID !== excludeId) return item;
        await wait(400);
    }
    throw new Error(`Timeout: no new mail for ${toAddress} (${subjectContains})`);
}

function quotedPrintableDecode(str) {
    return str.replace(/=\r\n/g, '').replace(/=([A-Fa-f0-9]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function decodeMailBody(item) {
    const parts = (item.MIME && item.MIME.Parts) || null;
    let body = '';
    if (parts) {
        for (const p of parts) {
            const ct = (p.Headers['Content-Type'] || [''])[0];
            if (ct.indexOf('text/plain') === -1 && ct.indexOf('text/html') === -1) continue;
            let b = p.Body;
            const te = (p.Headers['Content-Transfer-Encoding'] || [''])[0].toLowerCase();
            if (te === 'base64') b = Buffer.from(b, 'base64').toString('utf8');
            else if (te === 'quoted-printable') b = quotedPrintableDecode(b);
            body += '\n' + b;
        }
    }
    if (!body) body = item.Content.Body;
    return body;
}

// ---------------------------------------------------------------------------
// Login - real form fill-in + MFA (email code, read from mailhog)
// ---------------------------------------------------------------------------
async function login(page, subdir, user) {
    await goto(page, '/login');
    await shoot(page, subdir, '00-login-form');

    await page.type('#form_login input[name=email]', user.email);
    await page.type('#form_login input[name=password]', user.password);

    const before = await findLatestMail(user.email, null);
    await page.click('#button_login');
    await page.waitForSelector('#panel_mfa_verify:not(.is-hidden)', { visible: true, timeout: 8000 });
    await shoot(page, subdir, '00b-mfa-verify');

    const mail = await waitForNewMail(user.email, null, before && before.ID, 10000);
    const body = decodeMailBody(mail);
    const m = body.match(/class="code">\s*(\d{6})\s*</);
    if (!m) throw new Error('MFA code not found in the email body');

    await page.type('#form_mfa_verify input[name=code]', m[1]);
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }),
        page.click('#button_mfa_verify'),
    ]);
}

// ---------------------------------------------------------------------------
// general: home page, registration (form only, not submitted), forgot
// password, contacts page - all without logging in
// ---------------------------------------------------------------------------
async function generalScenario(browser) {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    const subdir = 'general';

    // Pre-login pages render in the default (hu) language unless the
    // language cookie is explicitly set - logged-in pages pick up the
    // account's own `language` field automatically on login, but these
    // don't go through a login, so we switch the cookie via the same
    // route the UI's language switcher uses.
    await goto(page, '/lang/en');

    await goto(page, '/');
    await shoot(page, subdir, '01-home');

    await goto(page, '/register');
    await shoot(page, subdir, '02-register');

    await goto(page, '/forgot-password');
    await shoot(page, subdir, '03-forgot-password');

    await goto(page, '/contacts');
    await shoot(page, subdir, '04-contacts');

    await page.close();
}

// ---------------------------------------------------------------------------
// radio-amateur: login+MFA, account, public diploma list/detail/stats,
// submission (log upload -> QSL -> states), own submissions
// ---------------------------------------------------------------------------
async function hamUserScenario(browser) {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    const subdir = 'radio-amateur';

    await login(page, subdir, HAM_USER);
    await shoot(page, subdir, '01-account');

    await goto(page, '/diplomas');
    await shoot(page, subdir, '02-diploma-list');

    await goto(page, `/diplomas/${DEMO_DIPLOMA_ID}`);
    await shoot(page, subdir, '03-diploma-details');

    try {
        await safeClick(page, 'a[href*="/stats"]', 5000);
        await page.waitForSelector('table', { timeout: 5000 }).catch(() => {});
        await shoot(page, subdir, '04-diploma-statistics');
    } catch (e) {
        console.log(`  ! statistics link failed: ${e.message}`);
    }

    // Log submission - a real ADIF file that matches the diploma's rules
    // (see tools/screenshot-doc/fixtures/testlog.adi and the README.md: 2
    // QSOs, worth 10+10 points via the OE regex rule, exactly meets the
    // demo diploma's 20-point home threshold).
    await goto(page, `/submissions/new/${DEMO_DIPLOMA_ID}`);
    await shoot(page, subdir, '05-submission-upload-form');

    const fileInput = await page.$('#input_submission_file');
    if (fileInput) {
        await fileInput.uploadFile(path.join(FIXTURES, 'testlog.adi'));
        await shoot(page, subdir, '06-submission-file-selected');

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
            page.click('button[type=submit]'),
        ]);
        await shoot(page, subdir, '07-submission-result');

        const url = page.url();
        const idMatch = url.match(/\/submissions\/([a-f0-9]{24})/i);
        if (idMatch) {
            const submissionId = idMatch[1];
            fs.writeFileSync(path.join(OUT, '.demo-submission-id'), submissionId, 'utf8');

            // If QSL sampling is enabled (this diploma has qslSampleCount:2,
            // 2 matched QSOs -> both get drawn), upload both images with our
            // own, dedicated test files - each QSO's confirmation is a
            // SEPARATE form/submit (see views/submissions/detail.html), and
            // each submission causes a full page reload, which wipes out the
            // file selection on any other (not-yet-submitted) input too - so
            // we upload and submit only ONE input per round, then continue
            // on the freshly reloaded page.
            let qslInputs = await page.$$('.qsl-file-input');
            const qslFiles = ['qsl1.png', 'qsl2.png'];
            let firstRound = true;
            let round = 0;
            while (qslInputs.length && round < 5) {
                await qslInputs[0].uploadFile(path.join(FIXTURES, qslFiles[round % qslFiles.length]));
                if (firstRound) {
                    await shoot(page, subdir, '08-qsl-upload-form');
                    firstRound = false;
                }
                const form = await qslInputs[0].evaluateHandle((el) => el.closest('form'));
                const submitBtn = await form.$('button[type=submit]');
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
                    submitBtn.click(),
                ]);
                round++;
                qslInputs = await page.$$('.qsl-file-input');
            }
            await shoot(page, subdir, '09-submission-qsl-uploaded');
        }
    }

    await goto(page, '/submissions');
    await shoot(page, subdir, '10-my-submissions-list');

    await page.close();
}

// ---------------------------------------------------------------------------
// manager: diploma-admin CRUD (tabs, incl. the autoApprove checkbox),
// settings, submission review (deciding on the submission the
// radio-amateur scenario created)
// ---------------------------------------------------------------------------
async function managerScenario(browser) {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    const subdir = 'manager';

    await login(page, subdir, MANAGER_USER);

    await goto(page, '/admin/diplomas');
    await shoot(page, subdir, '01-diploma-list');

    await goto(page, `/admin/diplomas/edit/${DEMO_DIPLOMA_ID}`);
    await shoot(page, subdir, '02-diploma-edit-basics');

    await safeClick(page, 'li.tab[data-id="tab_rules"]');
    await wait(300);
    await shoot(page, subdir, '03-diploma-edit-rules');

    // Auto-approval checkbox (feature added on user request) - checked here
    // purely for the screenshot, then unchecked again without saving, so the
    // demo diploma's actual saved config (autoApprove:false, so the
    // review-decision screenshots further down still make sense) is
    // untouched.
    try {
        await safeClick(page, '#input_auto_approve', 3000);
        await wait(200);
        await shoot(page, subdir, '03b-diploma-edit-autoapprove');
        await page.click('#input_auto_approve');
    } catch (e) {
        console.log(`  ! autoApprove checkbox screenshot failed: ${e.message}`);
    }

    await safeClick(page, 'li.tab[data-id="tab_payment"]');
    await wait(300);
    await shoot(page, subdir, '04-diploma-edit-payment');

    await safeClick(page, 'li.tab[data-id="tab_overlay"]');
    await wait(500);
    await shoot(page, subdir, '05-diploma-edit-layout');

    await goto(page, '/admin/settings');
    await shoot(page, subdir, '06-settings');

    await goto(page, '/admin/submissions');
    await shoot(page, subdir, '07-review-list');

    // Deciding on the test submission created earlier in the same run by
    // the radio-amateur scenario - if it's not found (e.g. this scenario
    // was run on its own), this part is skipped.
    const idFile = path.join(OUT, '.demo-submission-id');
    if (fs.existsSync(idFile)) {
        const submissionId = fs.readFileSync(idFile, 'utf8').trim();
        await goto(page, `/submissions/${submissionId}`);
        await shoot(page, subdir, '08-review-qso-table');

        const approveBtn = await page.$('#button_approve');
        if (approveBtn) {
            await approveBtn.evaluate((el) => el.scrollIntoView({ block: 'center' }));
            await shoot(page, subdir, '08b-review-decision');

            page.once('dialog', (d) => d.accept());
            await approveBtn.click();
            await wait(1200);
            await shoot(page, subdir, '09-submission-approved');
        } else {
            console.log('  ! no #button_approve button (already reviewed?)');
        }
    } else {
        console.log('  ! no previously created test submission (run the "radio-amateur" scenario first)');
    }

    await page.close();
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
const SCENARIOS = {
    general: (browser) => run('general', () => generalScenario(browser)),
    'radio-amateur': (browser) => run('radio-amateur', () => hamUserScenario(browser)),
    manager: (browser) => run('manager', () => managerScenario(browser)),
};

async function main() {
    const requested = process.argv.slice(2);
    const names = requested.length > 0 ? requested : Object.keys(SCENARIOS);

    ensureDir(OUT);

    const executablePath = resolveChromePath();
    if (!executablePath) {
        console.error('Could not find Chrome/Chromium on this machine (tried: ' + CHROME_CANDIDATES.join(', ') + ')');
        process.exit(1);
    }

    const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
        for (const name of names) {
            if (!SCENARIOS[name]) {
                console.log(`Unknown scenario: ${name}`);
                continue;
            }
            await SCENARIOS[name](browser);
        }
    } finally {
        await browser.close();
    }

    console.log('\nDone. Output: ' + OUT);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
