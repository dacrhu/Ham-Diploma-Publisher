exports.install = function () {
    ROUTE('GET /register', view_register);
    ROUTE('POST /api/register *Users/Users --> register');
    ROUTE('GET /api/captcha *Users/Users --> captchaChallenge');
    ROUTE('GET /verify-email/{token} *Users/Users --> verifyEmail');
};

function view_register() {
    let self = this;

    if (self.user) {
        self.redirect('/account');
        return;
    }

    self.repository.countries = COUNTRIES.list(self.language);
    self.view('register');
}
