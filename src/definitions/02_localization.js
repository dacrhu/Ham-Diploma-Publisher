// Total.js LOCALIZE hook — returns the request's language.
// Order: language cookie -> ?language= query param -> the default language
// set by the manager (settings.defaultLanguage) -> 'hu'.
// For a logged-in user, their own `language` account setting is written into
// the language cookie at login (see the users schema), so this hook doesn't
// need to make a separate DB call on every request — the hook is SYNCHRONOUS
// (it has no way to await a Mongo call), so it reads settings-store.js's
// in-memory SETTINGS.cache directly, the same way
// definitions/12_site_branding.js does too.
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
