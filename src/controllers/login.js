exports.install = function () {
    ROUTE('GET /login', view_login);
    ROUTE('POST /api/login *Users/Users --> login');
    ROUTE('POST /api/mfa/setup-select *Users/Users --> mfaSetupSelect');
    ROUTE('POST /api/mfa/setup-confirm *Users/Users --> mfaSetupConfirm');
    ROUTE('POST /api/mfa/verify *Users/Users --> mfaVerify');
    ROUTE('GET /logout *Users/Users --> logout');

    ROUTE('GET /forgot-password', view_forgot_password);
    ROUTE('POST /api/forgot-password *Users/Users --> forgotPassword');

    ROUTE('GET /reset-password', view_reset_password);
    ROUTE('POST /api/reset-password *Users/Users --> resetPassword');
};

function view_login() {
    let self = this;

    if (self.user) {
        self.redirect('/account');
        return;
    }

    self.view('login');
}

function view_forgot_password() {
    if (this.user) {
        this.redirect('/account');
        return;
    }
    this.view('forgot-password');
}

function view_reset_password() {
    let self = this;

    if (self.user) {
        self.redirect('/account');
        return;
    }

    self.repository.code = self.query.code || '';
    self.view('reset-password');
}
