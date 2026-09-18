// Language switcher — the LOCALIZE hook (02_localization.js) prefers the cookie
// over the query parameter, so switching language requires setting the cookie.
exports.install = function () {
    ROUTE('GET /lang/{code}', set_language);
};

const ALLOWED = ['hu', 'en', 'de'];

function set_language(code) {
    let self = this;
    if (ALLOWED.indexOf(code) === -1) {
        code = 'hu';
    }
    self.cookie(CONF.cookieLangName, code, '30 days');
    self.redirect(self.req.headers.referer || '/');
}
