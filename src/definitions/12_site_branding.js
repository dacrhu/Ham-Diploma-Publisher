// A `views/layout.html` (oldalsáv logó + cím) MINDEN oldalon renderelődik,
// nem csak a home controlleren keresztül — ezért ezt itt, egy globális
// `ON('controller')` hookkal töltjük a repository-ba minden egyes requestnél,
// NEM az egyes controllerek repository-jából. A hook szinkron (nincs módja
// megvárni egy Mongo-hívást), ezért a `SETTINGS.cache`-re támaszkodik (lásd
// modules/settings-store.js) — ha a cache még nincs bemelegítve (induláskor,
// az `ON('ready')` lefutása előtti pillanatban), a defaultra esik vissza.
ON('controller', function (controller) {
    let settings = SETTINGS.cache || SETTINGS.DEFAULTS;

    controller.repository.siteTitle = settings.siteTitle || RESOURCE(controller.language, 'app.name');
    controller.repository.hasSiteLogo = !!(settings.siteLogo && settings.siteLogo.key);
    controller.repository.siteAssetVersion = settings.updated ? new Date(settings.updated).getTime() : 0;
});

ON('ready', async function () {
    await SETTINGS.get();
});
