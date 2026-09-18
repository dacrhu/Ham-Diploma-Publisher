exports.install = function () {
    ROUTE('GET /', view_home);
};

async function view_home() {
    let self = this;
    let settings = await SETTINGS.get();

    // repository.siteTitle-t már a globális ON('controller') hook beállította
    // (lásd definitions/12_site_branding.js) — ugyanaz az érték kell ide is,
    // mint az oldalsáv brandinghez, nincs értelme duplán kiszámolni.
    self.repository.hasBanner = !!(settings.siteBanner && settings.siteBanner.key);
    self.repository.bannerVersion = settings.updated ? new Date(settings.updated).getTime() : 0;

    // A manager által szabadon (több soros textarea-ban) beírt üdvözlő szöveget
    // bekezdésekre bontva, a view-ban SOSE raw HTML-ként (hanem a Total.js
    // auto-escape-elő `@{p}`-jével) írjuk ki egyenként — nincs rá szükség, hogy
    // az admin HTML-t injektálhasson, a sortörés-megtartáshoz elég a bekezdésekre
    // bontás. Üres/nincs beállítva esetén a fallback resource-szöveg (egyetlen
    // bekezdésként).
    let welcomeText = (settings.siteWelcomeText || '').trim();
    self.repository.welcomeParagraphs = welcomeText
        ? welcomeText.split(/\n+/).map(line => line.trim()).filter(line => line)
        : [RESOURCE(self.language, 'home.intro')];

    self.view('home');
}
