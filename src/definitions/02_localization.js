// Total.js LOCALIZE hook — a request nyelvét adja vissza.
// Sorrend: nyelvi cookie -> ?language= query param -> manager által
// beállított alapértelmezett nyelv (settings.defaultLanguage) -> 'hu'.
// Bejelentkezett usernél a saját `language` fiókbeállítása a bejelentkezéskor
// a nyelvi cookie-ba kerül (lásd users schema), így ez a hook nem kell hogy
// külön DB-hívást indítson minden requestnél — a hook SZINKRON (nincs módja
// megvárni egy Mongo-hívást), ezért a settings-store.js memóriabeli
// SETTINGS.cache-ét olvassa közvetlenül, ugyanúgy, ahogy a
// definitions/12_site_branding.js is teszi.
LOCALIZE(function (req, res) {
    if (req.cookie(CONF.cookieLangName)) {
        return req.cookie(CONF.cookieLangName);
    } else if (req.query.language) {
        return req.query.language;
    } else {
        let settings = SETTINGS.cache || SETTINGS.DEFAULTS;
        return settings.defaultLanguage || 'hu';
    }
});
