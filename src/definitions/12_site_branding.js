// `views/layout.html` (sidebar logo + title) is rendered on EVERY page, not
// only through the home controller — so we load it into the repository here,
// via a global `ON('controller')` hook, on every single request, NOT from
// each individual controller's repository. The hook is synchronous (it has no
// way to await a Mongo call), so it relies on `SETTINGS.cache` (see
// modules/settings-store.js) — if the cache isn't warmed up yet (at startup,
// the moment before `ON('ready')` runs), it falls back to the default.
ON('controller', function (controller) {
    let settings = SETTINGS.cache || SETTINGS.DEFAULTS;

    controller.repository.siteTitle = settings.siteTitle || RESOURCE(controller.language, 'app.name');
    controller.repository.hasSiteLogo = !!(settings.siteLogo && settings.siteLogo.key);
    controller.repository.siteAssetVersion = settings.updated ? new Date(settings.updated).getTime() : 0;
});

ON('ready', async function () {
    await SETTINGS.get();
});
