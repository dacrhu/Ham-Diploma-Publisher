exports.install = function () {
    ROUTE('GET /account', view_account);
    ROUTE('+GET /api/account *Users/Users --> get');
    ROUTE('+POST /api/account *Users/Users --> save');
    ROUTE('+POST /api/account/mfa/start *Users/Users --> mfaSelfStart');
    ROUTE('+POST /api/account/mfa/confirm *Users/Users --> mfaSelfConfirm');
    ROUTE('+POST /api/account/mfa/disable *Users/Users --> mfaSelfDisable');
};

async function view_account() {
    let self = this;

    if (!self.user) {
        self.redirect('/login');
        return;
    }

    let profile = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(self.user._id) }, {
        projection: { passwordHash: 0, 'mfa.totpSecret': 0 }
    });

    let settings = await SETTINGS.get();
    let policy = SETTINGS.mfaPolicyFor(settings, self.user);

    self.repository.profile = profile;
    self.repository.countries = COUNTRIES.list(self.language);
    self.repository.mfaMethodsAllowed = settings.mfaMethodsAllowed;
    self.repository.mfaCanDisable = policy !== 'required';
    self.view('account');
}
