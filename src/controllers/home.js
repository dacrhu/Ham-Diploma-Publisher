exports.install = function () {
    ROUTE('GET /', view_home);
};

async function view_home() {
    let self = this;
    let settings = await SETTINGS.get();

    // repository.siteTitle is already set by the global ON('controller') hook
    // (see definitions/12_site_branding.js) — the same value is needed here
    // too, as for the sidebar branding, no point computing it twice.
    self.repository.hasBanner = !!(settings.siteBanner && settings.siteBanner.key);
    self.repository.bannerVersion = settings.updated ? new Date(settings.updated).getTime() : 0;

    // The welcome text entered freely by the manager (in a multi-line textarea)
    // is split into paragraphs and written out one by one in the view NEVER as
    // raw HTML (but via Total.js's auto-escaping `@{p}`) — there's no need to
    // let the admin inject HTML, splitting into paragraphs is enough to
    // preserve line breaks. If empty/not set, the fallback resource string (as
    // a single paragraph).
    let welcomeText = (settings.siteWelcomeText || '').trim();
    self.repository.welcomeParagraphs = welcomeText
        ? welcomeText.split(/\n+/).map(line => line.trim()).filter(line => line)
        : [RESOURCE(self.language, 'home.intro')];

    self.view('home');
}
