// Jelszó-szabály — a frontend párja: fePasswordRules / fePasswordValid
// (src/public/js/frontendhelper.js). Bármelyik módosításakor a másikat is frissítsd.
FUNC.passwordRules = function (password) {
    password = password || '';
    return {
        length: password.length >= 12 && password.length <= 128,
        lower: /[a-z]/.test(password),
        upper: /[A-Z]/.test(password),
        digit: /\d/.test(password),
        special: /[^A-Za-z0-9]/.test(password)
    };
};

FUNC.passwordValid = function (password) {
    let r = FUNC.passwordRules(password);
    return r.length && r.lower && r.upper && r.digit && r.special;
};
