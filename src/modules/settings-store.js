// settings-store.js — reads the singleton `settings` document (_id: 'global')
// supplemented with default values. Internal (non-permission-checked) access — the
// login action also reads the MFA policy through this. The manager-side admin UI
// reads/writes through the Settings/Settings schema in
// schemas/settings/settings.js (permissions:['manager']).
global.SETTINGS = {};

SETTINGS.DEFAULTS = {
    mfaPolicyUser: 'disabled',
    mfaPolicyManager: 'disabled',
    mfaMethodsAllowed: ['email', 'totp'],
    // Home page/sidebar customization (at user request): custom logo
    // (top of sidebar, on every page)/title/welcome text/banner (home page
    // only) — stored in a single language, the same way the diploma's name/
    // description is also not translated (see CLAUDE.md). If empty/null,
    // falls back to the resource fallback (app.name / home.intro).
    siteTitle: '',
    siteWelcomeText: '',
    siteLogo: null,
    siteBanner: null,
    // Used by the LOCALIZE hook (definitions/02_localization.js) when the
    // visitor has neither a language cookie nor a ?language= query parameter
    // (e.g. first visit) — previously this always fell back to the hardcoded
    // 'hu', it was made configurable on the admin page at user request.
    defaultLanguage: 'hu',
    // Free-text content of the "Contacts" page (at user request) — the
    // manager/sa enters RAW HTML (no field-by-field structure, "everyone
    // fills it in however they want"), which the public `/contacts` page
    // renders WITHOUT ANY CHANGES, without escaping (see views/contacts.html
    // `@{!repository.contactsHtml}` — the `!` prefix disables the Total.js
    // view engine's default auto-escaping). This is an INTENTIONAL, accepted
    // XSS risk: it can only be edited with manager/sa permission (see
    // schemas/settings/settings.js save action permissions:['manager']),
    // the same trust circle as, e.g., editing the diploma overlay or the bank
    // account details — not user input.
    contactsHtml: '',
    // Content of the "Privacy policy" page — the same trust circle/trick
    // as `contactsHtml` (see above): the manager/sa enters RAW HTML, the
    // public `/privacy` page renders it without any changes. Defaults to
    // an English-language template (per the user's request, one language is
    // enough; the admin can put their own translation into the same field,
    // below the English text — see settings.privacy.help). The [bracketed]
    // parts are intentionally blank placeholders, for the operator to fill in.
    privacyPolicyHtml: '<h3>Data Controller</h3>' +
        '<p>[Data controller name, address and contact details]</p>' +
        '<h3>What data we collect</h3>' +
        '<p>When you register, we collect: your name, callsign, e-mail address, password (stored as a salted hash, never in plain text) and country. ' +
        'The postal address (street, city, ZIP code) is optional and only needs to be provided if you would like to receive a diploma printed and shipped by post.</p>' +
        '<h3>Why we use this data</h3>' +
        '<p>We use the data above solely for issuing your diplomas and, where you have requested it, for shipping the printed diploma to you. We do not use it for any other purpose and do not share it with third parties beyond what is required for shipping.</p>' +
        '<h3>Cookies</h3>' +
        '<p>This site only uses the cookies listed below, both required for the site to work. We do not use tracking or advertising cookies.</p>' +
        '<table>' +
        '<thead><tr><th>Cookie name</th><th>Purpose</th><th>Lifetime</th></tr></thead>' +
        '<tbody>' +
        '<tr><td><code>hdp_auth</code></td><td>Keeps you logged in. Holds only a random session identifier — no personal data is stored in the cookie itself.</td><td>Until you log out, or automatically after about 1 day of inactivity</td></tr>' +
        '<tr><td><code>hdp_lang</code></td><td>Remembers your selected display language (Hungarian / English / German).</td><td>30 days</td></tr>' +
        '</tbody>' +
        '</table>' +
        '<h3>Local storage</h3>' +
        '<p>In addition to cookies, this site stores a small amount of data in your browser\'s local storage — this stays only on your own device and is never sent to our server:</p>' +
        '<table>' +
        '<thead><tr><th>Key</th><th>Purpose</th></tr></thead>' +
        '<tbody>' +
        '<tr><td><code>hdp_cookie_consent</code></td><td>Remembers that you have seen and dismissed the cookie notice.</td></tr>' +
        '<tr><td><code>hdp_page_size</code></td><td>Remembers your preferred number of rows per page in list views.</td></tr>' +
        '</tbody>' +
        '</table>' +
        '<h3>Hosting</h3>' +
        '<p>This site is hosted at: [hosting provider name and location].</p>',
    // Accepted QSL confirmation types (checkbox set, editable on the admin
    // settings page) — all checked by default. The submissions QSL upload
    // section lists what's accepted based on this (see
    // controllers/submissions.js view_detail, views/submissions/detail.html).
    qslTypesAllowed: ['lotw', 'eqsl', 'qrz', 'clublog', 'hrdlog', 'email', 'paper']
};

// `layout.html` (sidebar logo/title) is rendered on EVERY page, not just
// through the home controller — this requires a global, SYNCHRONOUS
// `ON('controller')` hook (see definitions/12_site_branding.js), which has no
// way to wait for a DB call. So here we keep a simple in-memory cache: the
// hook reads this (`SETTINGS.cache`) directly, WITHOUT a DB call, on every
// request — the cache is refreshed immediately at startup (`ON('ready')`) and
// AFTER every save/upload (see SETTINGS.invalidate), so it's never noticeably
// stale.
SETTINGS.cache = null;

SETTINGS.get = async function () {
    if (SETTINGS.cache)
        return Object.assign({}, SETTINGS.cache);

    let doc = await MDB.findOne(process.env.MONGODB_DB_NAME, 'settings', { _id: 'global' });

    SETTINGS.cache = (!doc || Array.isArray(doc)) ? Object.assign({}, SETTINGS.DEFAULTS) : Object.assign({}, SETTINGS.DEFAULTS, doc);
    return Object.assign({}, SETTINGS.cache);
};

// Called by the settings save/logo/banner upload AFTER the DB write, so that
// the cache (and with it, the synchronous `ON('controller')` hook) sees fresh
// data immediately — we don't wait for any TTL.
SETTINGS.invalidate = async function () {
    SETTINGS.cache = null;
    await SETTINGS.get();
};

// Selects the MFA policy for a given user's role (sa / manager permission /
// plain radio amateur).
SETTINGS.mfaPolicyFor = function (settings, user) {
    let isManagerRole = !!(user && (user.sa || (user.permissions || []).indexOf('manager') !== -1));
    return isManagerRole ? settings.mfaPolicyManager : settings.mfaPolicyUser;
};
