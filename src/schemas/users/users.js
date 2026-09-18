// Users/Users — regisztráció, e-mail megerősítés, belépés/kilépés, jelszó-csere,
// saját profil, MFA (email-kód / TOTP authenticator app).
//
// MFA folyamat (settings.mfaPolicyUser/mfaPolicyManager alapján, lásd
// modules/settings-store.js):
//   - Ha a useren már be van kapcsolva az MFA: login után egy "verify" pending
//     tokent kapunk vissza -> mfaVerify action zárja le, hozza létre a sessiont.
//   - Ha a policy kötelező, de a useren még nincs bekapcsolva (akár mert most
//     regisztrált, akár mert a manager utólag kapcsolta be a policyt): login
//     után egy "setup" pending tokent kapunk -> mfaSetupSelect (módszerválasztás
//     + kód/QR kiküldése) -> mfaSetupConfirm (kód ellenőrzése, ez perzisztálja a
//     user.mfa mezőt ÉS létrehozza a sessiont is). Ugyanez a két action fut le
//     regisztráció után az első belépéskor is — nincs külön "regisztrációkori"
//     MFA-setup, mert az e-mail megerősítés amúgy is megelőzi az első belépést.
// A pending tokenek a REDIS_DB_MFA adatbázisban élnek, TTL_MFA_PENDING ideig.
NEWSCHEMA('Users/Users', function (schema) {

    // Regisztráció előtti "captcha" — felhasználói kérésre, bot-ellenes
    // ellenőrzésként rádióamatőr-tudást igénylő kérdés (adott frekvencia (kHz)
    // melyik amatőrsávba esik, lásd modules/band-captcha.js). A helyes választ
    // NEM a kliens kapja meg — egy egyszer használatos tokenhez kötve a
    // REDIS_DB_CAPTCHA adatbázisban tároljuk, TTL_CAPTCHA ideig; a `register`
    // action ellenőrzi és azonnal érvényteleníti (lásd ott).
    schema.action('captchaChallenge', {
        action: async function ($) {
            let question = BAND_CAPTCHA.generate();
            let token = GUID(40);

            await REDIS.hset(process.env.REDIS_DB_CAPTCHA, token, 'answer', question.answer);
            await REDIS.expire(process.env.REDIS_DB_CAPTCHA, token, Number(process.env.TTL_CAPTCHA));

            $.callback({ success: true, token: token, frequencyKHz: question.frequencyKHz, options: question.options });
        }
    });

    schema.action('register', {
        input: '*email:email, *password:string, *passwordConfirm:string, *callsign:string, *firstName:string, *lastName:string, *country:string, street:string, city:string, zip:string, *captchaToken:string, *captchaAnswer:string',
        language: true,
        action: async function ($) {
            let model = $.model;

            // A captcha-token EGYSZER használatos — a lekérdezés UTÁN azonnal
            // érvénytelenítjük (lásd a login/resetPassword kódban is használt
            // `.expire(...,-1)` mintát), függetlenül attól, helyes volt-e a
            // válasz, hogy ne lehessen ugyanazt a tokent újra próbálgatni.
            let captchaRecord = await REDIS.hgetall(process.env.REDIS_DB_CAPTCHA, model.captchaToken);
            await REDIS.expire(process.env.REDIS_DB_CAPTCHA, model.captchaToken, -1);

            if (!captchaRecord || !captchaRecord.answer || captchaRecord.answer !== model.captchaAnswer) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.captcha.invalid') });
                return;
            }

            if (!FUNC.passwordValid(model.password)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.password.invalid') });
                return;
            }

            if (model.password !== model.passwordConfirm) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.password.mismatch') });
                return;
            }

            let email = model.email.toLowerCase().trim();
            let existing = await MDB.checkExist(process.env.MONGODB_DB_NAME, 'users', { email: email });

            if (isDbError(existing)) {
                FUNC.logger($, `Users/Users register DB error (checkExist): ${JSON.stringify(existing[0].error)}`);
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            if (existing) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.email.taken') });
                return;
            }

            let callsign = (model.callsign || '').toUpperCase().trim();
            let country = (model.country || '').toUpperCase().trim();
            let now = new Date();

            let doc = {
                email: email,
                passwordHash: model.password.hash(process.env.USER_HASH_TYPE, process.env.USER_HASH_SALT),
                callsign: callsign,
                firstName: model.firstName.trim(),
                lastName: model.lastName.trim(),
                country: country,
                address: { street: model.street || '', city: model.city || '', zip: model.zip || '', country: country },
                language: $.language,
                permissions: [],
                sa: isSuperuserEmail(email),
                mfa: { enabled: false, method: null, totpSecret: null, verifiedAt: null },
                status: 'pending_verification',
                created: now,
                updated: now
            };

            let insert = await MDB.insertOne(process.env.MONGODB_DB_NAME, 'users', doc);

            if (isDbError(insert) || !insert.insertedId) {
                FUNC.logger($, `Users/Users register FAILED: ${email}`);
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            let token = GUID(40);
            await REDIS.hset(process.env.REDIS_DB_EMAIL_VERIFY, token, 'userId', String(insert.insertedId));
            await REDIS.expire(process.env.REDIS_DB_EMAIL_VERIFY, token, Number(process.env.TTL_EMAIL_VERIFY));

            MAIL(email, RESOURCE($.language, 'email.verify.subject'), 'register/email-verify', {
                greeting: RESOURCE($.language, 'email.greeting'),
                name: formatName($.language, doc.firstName, doc.lastName),
                intro: RESOURCE($.language, 'email.verify.intro'),
                btn_label: RESOURCE($.language, 'email.verify.btn'),
                verify_link: FUNC.emailLink(`/verify-email/${token}`),
                footer: RESOURCE($.language, 'email.footer')
            }, $.language, function (err) {
                if (err) FUNC.logger($, `Email ERROR (verify): ${email} -> ${err}`);
            });

            FUNC.logger($, `Users/Users register: ${email} (${callsign})`);
            $.callback({ success: true });
        }
    });

    schema.action('verifyEmail', {
        language: true,
        action: async function ($) {
            let token = $.params.token;
            let record = await REDIS.hgetall(process.env.REDIS_DB_EMAIL_VERIFY, token);

            if (!record || !record.userId) {
                $.controller.redirect('/login?verify=invalid');
                return;
            }

            await MDB.updateOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(record.userId) }, { status: 'active', updated: new Date() });
            await REDIS.expire(process.env.REDIS_DB_EMAIL_VERIFY, token, -1);

            FUNC.logger($, `Users/Users verifyEmail: ${record.userId}`);
            $.controller.redirect('/login?verify=ok');
        }
    });

    schema.action('login', {
        input: '*email:email, *password:string',
        language: true,
        action: async function ($) {
            let email = $.model.email.toLowerCase().trim();
            let user = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { email: email });

            if (isDbError(user) || !user) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.login.invalid') });
                return;
            }

            let hash = $.model.password.hash(process.env.USER_HASH_TYPE, process.env.USER_HASH_SALT);

            if (hash !== user.passwordHash) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.login.invalid') });
                return;
            }

            if (user.status === 'disabled') {
                $.callback({ success: false, message: RESOURCE($.language, 'error.login.disabled') });
                return;
            }

            if (user.status !== 'active') {
                $.callback({ success: false, message: RESOURCE($.language, 'error.login.notverified') });
                return;
            }

            if (user.mfa && user.mfa.enabled) {
                // Az MFA már be van állítva ezen a fiókon -> kód-ellenőrzés szükséges.
                let pendingToken = GUID(40);
                await REDIS.hset(process.env.REDIS_DB_MFA, pendingToken, 'stage', 'verify');
                await REDIS.hset(process.env.REDIS_DB_MFA, pendingToken, 'userId', String(user._id));
                await REDIS.hset(process.env.REDIS_DB_MFA, pendingToken, 'method', user.mfa.method);

                if (user.mfa.method === 'email') {
                    let code = make6DigitCode();
                    await REDIS.hset(process.env.REDIS_DB_MFA, pendingToken, 'code', code);
                    sendMfaCodeEmail($, user, code);
                }

                await REDIS.expire(process.env.REDIS_DB_MFA, pendingToken, Number(process.env.TTL_MFA_PENDING));

                FUNC.logger($, `Users/Users login: ${email} -> MFA verify (${user.mfa.method})`);
                $.callback({ success: true, next: 'mfa_verify', method: user.mfa.method, token: pendingToken });
                return;
            }

            let settings = await SETTINGS.get();
            let policy = SETTINGS.mfaPolicyFor(settings, user);

            if (policy === 'required') {
                // A policy kötelezővé teszi az MFA-t, de ezen a fiókon még nincs
                // beállítva (új regisztráció, vagy utólag lett kötelező) ->
                // beállítás-kényszerítés a session létrehozása előtt.
                let pendingToken = GUID(40);
                await REDIS.hset(process.env.REDIS_DB_MFA, pendingToken, 'stage', 'setup');
                await REDIS.hset(process.env.REDIS_DB_MFA, pendingToken, 'userId', String(user._id));
                await REDIS.expire(process.env.REDIS_DB_MFA, pendingToken, Number(process.env.TTL_MFA_PENDING));

                FUNC.logger($, `Users/Users login: ${email} -> MFA setup required`);
                $.callback({ success: true, next: 'mfa_setup', token: pendingToken, methods: settings.mfaMethodsAllowed });
                return;
            }

            await createSession($, user);
            FUNC.logger($, `Users/Users login: ${email}`);
            $.callback({ success: true, next: 'main' });
        }
    });

    schema.action('mfaSetupSelect', {
        input: '*token:string, *method:string',
        language: true,
        action: async function ($) {
            let record = await REDIS.hgetall(process.env.REDIS_DB_MFA, $.model.token);

            if (!record || record.stage !== 'setup' || !record.userId) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.mfa.invalid') });
                return;
            }

            if (['email', 'totp'].indexOf($.model.method) === -1) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            let user = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(record.userId) });

            if (isDbError(user) || !user) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            await REDIS.hset(process.env.REDIS_DB_MFA, $.model.token, 'method', $.model.method);

            if ($.model.method === 'email') {
                let code = make6DigitCode();
                await REDIS.hset(process.env.REDIS_DB_MFA, $.model.token, 'code', code);
                sendMfaCodeEmail($, user, code);
                $.callback({ success: true, method: 'email' });
                return;
            }

            // TOTP: a secret csak ideiglenesen, a pending tokenhez kötve kerül
            // tárolásra — a user dokumentumba csak sikeres megerősítés (mfaSetupConfirm)
            // után íródik.
            let secret = TOTP.generateSecret();
            await REDIS.hset(process.env.REDIS_DB_MFA, $.model.token, 'totpSecretPending', secret);

            let uri = TOTP.keyUri(secret, user.email, CONF.name);
            let qr = await QRCode.toDataURL(uri);

            $.callback({ success: true, method: 'totp', secret: secret, qr: qr });
        }
    });

    schema.action('mfaSetupConfirm', {
        input: '*token:string, *code:string',
        language: true,
        action: async function ($) {
            let record = await REDIS.hgetall(process.env.REDIS_DB_MFA, $.model.token);

            if (!record || record.stage !== 'setup' || !record.userId || !record.method) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.mfa.invalid') });
                return;
            }

            let user = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(record.userId) });

            if (isDbError(user) || !user) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            let mfaUpdate;

            if (record.method === 'email') {
                if (record.code !== $.model.code.trim()) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.mfa.code') });
                    return;
                }
                mfaUpdate = { enabled: true, method: 'email', totpSecret: null, verifiedAt: new Date() };
            } else {
                if (!record.totpSecretPending || !TOTP.verify(record.totpSecretPending, $.model.code)) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.mfa.code') });
                    return;
                }
                mfaUpdate = { enabled: true, method: 'totp', totpSecret: record.totpSecretPending, verifiedAt: new Date() };
            }

            await MDB.updateOne(process.env.MONGODB_DB_NAME, 'users', { _id: user._id }, { mfa: mfaUpdate, updated: new Date() });
            await REDIS.expire(process.env.REDIS_DB_MFA, $.model.token, -1);

            user.mfa = mfaUpdate;
            await createSession($, user);

            FUNC.logger($, `Users/Users mfaSetupConfirm: ${user.email} (${record.method})`);
            $.callback({ success: true, next: 'main' });
        }
    });

    schema.action('mfaVerify', {
        input: '*token:string, *code:string',
        language: true,
        action: async function ($) {
            let record = await REDIS.hgetall(process.env.REDIS_DB_MFA, $.model.token);

            if (!record || record.stage !== 'verify' || !record.userId || !record.method) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.mfa.invalid') });
                return;
            }

            let user = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(record.userId) });

            if (isDbError(user) || !user) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            let valid = record.method === 'email'
                ? record.code === $.model.code.trim()
                : TOTP.verify(user.mfa.totpSecret, $.model.code);

            if (!valid) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.mfa.code') });
                return;
            }

            await REDIS.expire(process.env.REDIS_DB_MFA, $.model.token, -1);
            await createSession($, user);

            FUNC.logger($, `Users/Users mfaVerify: ${user.email}`);
            $.callback({ success: true, next: 'main' });
        }
    });

    // --- Önkiszolgáló MFA-kezelés (bejelentkezve, a /account oldalról) ---
    // A login-időbeli mfaSetupSelect/Confirm-tól eltérően itt $.user már ismert
    // (a session hitelesít), nincs szükség jelszó-ellenőrzésre — de a pending
    // Redis-rekordba mentjük a userId-t is, hogy a confirm lépés ellenőrizhesse,
    // hogy a token tényleg a hívó saját fiókjához tartozik.

    schema.action('mfaSelfStart', {
        input: '*method:string',
        language: true,
        action: async function ($) {
            if (!$.user) {
                $.callback({ success: false });
                return;
            }

            if (['email', 'totp'].indexOf($.model.method) === -1) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            let user = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID($.user._id) });

            if (isDbError(user) || !user) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            let token = GUID(40);
            await REDIS.hset(process.env.REDIS_DB_MFA, token, 'stage', 'self_setup');
            await REDIS.hset(process.env.REDIS_DB_MFA, token, 'userId', String(user._id));
            await REDIS.hset(process.env.REDIS_DB_MFA, token, 'method', $.model.method);

            if ($.model.method === 'email') {
                let code = make6DigitCode();
                await REDIS.hset(process.env.REDIS_DB_MFA, token, 'code', code);
                sendMfaCodeEmail($, user, code);
                await REDIS.expire(process.env.REDIS_DB_MFA, token, Number(process.env.TTL_MFA_PENDING));
                $.callback({ success: true, method: 'email', token: token });
                return;
            }

            let secret = TOTP.generateSecret();
            await REDIS.hset(process.env.REDIS_DB_MFA, token, 'totpSecretPending', secret);
            await REDIS.expire(process.env.REDIS_DB_MFA, token, Number(process.env.TTL_MFA_PENDING));

            let uri = TOTP.keyUri(secret, user.email, CONF.name);
            let qr = await QRCode.toDataURL(uri);

            $.callback({ success: true, method: 'totp', secret: secret, qr: qr, token: token });
        }
    });

    schema.action('mfaSelfConfirm', {
        input: '*token:string, *code:string',
        language: true,
        action: async function ($) {
            if (!$.user) {
                $.callback({ success: false });
                return;
            }

            let record = await REDIS.hgetall(process.env.REDIS_DB_MFA, $.model.token);

            if (!record || record.stage !== 'self_setup' || record.userId !== String($.user._id) || !record.method) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.mfa.invalid') });
                return;
            }

            let mfaUpdate;

            if (record.method === 'email') {
                if (record.code !== $.model.code.trim()) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.mfa.code') });
                    return;
                }
                mfaUpdate = { enabled: true, method: 'email', totpSecret: null, verifiedAt: new Date() };
            } else {
                if (!record.totpSecretPending || !TOTP.verify(record.totpSecretPending, $.model.code)) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.mfa.code') });
                    return;
                }
                mfaUpdate = { enabled: true, method: 'totp', totpSecret: record.totpSecretPending, verifiedAt: new Date() };
            }

            await MDB.updateOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID($.user._id) }, { mfa: mfaUpdate, updated: new Date() });
            await REDIS.expire(process.env.REDIS_DB_MFA, $.model.token, -1);

            FUNC.logger($, `Users/Users mfaSelfConfirm: ${$.user.email} (${record.method})`);
            $.callback({ success: true });
        }
    });

    schema.action('mfaSelfDisable', {
        language: true,
        action: async function ($) {
            if (!$.user) {
                $.callback({ success: false });
                return;
            }

            let settings = await SETTINGS.get();
            let policy = SETTINGS.mfaPolicyFor(settings, $.user);

            if (policy === 'required') {
                $.callback({ success: false, message: RESOURCE($.language, 'error.mfa.required') });
                return;
            }

            let mfaUpdate = { enabled: false, method: null, totpSecret: null, verifiedAt: null };
            await MDB.updateOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID($.user._id) }, { mfa: mfaUpdate, updated: new Date() });

            FUNC.logger($, `Users/Users mfaSelfDisable: ${$.user.email}`);
            $.callback({ success: true });
        }
    });

    schema.action('logout', {
        action: async function ($) {
            let cookie = $.controller ? $.controller.cookie(CONF.cookieAuthName) : null;

            if (cookie) {
                await REDIS.expire(process.env.REDIS_DB_SESSION, cookie, -1);
                $.controller.cookie(CONF.cookieAuthName, '', '-1 day');
            }

            FUNC.logger($, 'Users/Users logout');
            $.controller.redirect('/');
        }
    });

    schema.action('forgotPassword', {
        input: '*email:email',
        language: true,
        action: async function ($) {
            let email = $.model.email.toLowerCase().trim();
            let user = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { email: email });

            // Szándékosan mindig sikeres választ adunk (e-mail cím létezésének
            // kiszivárogtatását elkerülendő), a levél csak akkor megy ki, ha van user.
            if (user && !isDbError(user) && user.status === 'active') {
                let code = GUID(40);
                await REDIS.hset(process.env.REDIS_DB_CHANGE_PASSWORD, code, 'userId', String(user._id));
                await REDIS.expire(process.env.REDIS_DB_CHANGE_PASSWORD, code, Number(process.env.TTL_CHANGE_PASS));

                MAIL(email, RESOURCE($.language, 'email.forgot.subject'), 'login/email-forgot-password', {
                    greeting: RESOURCE($.language, 'email.greeting'),
                    name: formatName($.language, user.firstName, user.lastName),
                    intro: RESOURCE($.language, 'email.forgot.intro'),
                    btn_label: RESOURCE($.language, 'email.forgot.btn'),
                    reset_link: FUNC.emailLink(`/reset-password?code=${code}`),
                    ttl_hours: Math.round(Number(process.env.TTL_CHANGE_PASS) / 3600),
                    footer: RESOURCE($.language, 'email.footer')
                }, $.language, function (err) {
                    if (err) FUNC.logger($, `Email ERROR (forgot-password): ${email} -> ${err}`);
                });

                FUNC.logger($, `Users/Users forgotPassword: ${email}`);
            }

            $.callback({ success: true });
        }
    });

    schema.action('resetPassword', {
        input: '*code:string, *password:string, *passwordConfirm:string',
        language: true,
        action: async function ($) {
            let record = await REDIS.hgetall(process.env.REDIS_DB_CHANGE_PASSWORD, $.model.code);

            if (!record || !record.userId) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.reset.invalid') });
                return;
            }

            if (!FUNC.passwordValid($.model.password)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.password.invalid') });
                return;
            }

            if ($.model.password !== $.model.passwordConfirm) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.password.mismatch') });
                return;
            }

            let hash = $.model.password.hash(process.env.USER_HASH_TYPE, process.env.USER_HASH_SALT);
            await MDB.updateOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID(record.userId) }, { passwordHash: hash, updated: new Date() });
            await REDIS.expire(process.env.REDIS_DB_CHANGE_PASSWORD, $.model.code, -1);

            FUNC.logger($, `Users/Users resetPassword: ${record.userId}`);
            $.callback({ success: true });
        }
    });

    schema.action('get', {
        action: async function ($) {
            if (!$.user) {
                $.callback({ success: false });
                return;
            }

            let user = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID($.user._id) }, {
                projection: { passwordHash: 0, 'mfa.totpSecret': 0 }
            });

            if (isDbError(user) || !user) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            $.callback({ success: true, data: user });
        }
    });

    schema.action('save', {
        input: '*firstName:string, *lastName:string, *callsign:string, *country:string, street:string, city:string, zip:string, *language:string, password:string, passwordConfirm:string',
        language: true,
        action: async function ($) {
            if (!$.user) {
                $.callback({ success: false });
                return;
            }

            let model = $.model;
            let country = (model.country || '').toUpperCase().trim();

            let set = {
                firstName: model.firstName.trim(),
                lastName: model.lastName.trim(),
                callsign: (model.callsign || '').toUpperCase().trim(),
                country: country,
                address: { street: model.street || '', city: model.city || '', zip: model.zip || '', country: country },
                language: model.language,
                updated: new Date()
            };

            if (model.password) {
                if (!FUNC.passwordValid(model.password)) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.password.invalid') });
                    return;
                }

                if (model.password !== model.passwordConfirm) {
                    $.callback({ success: false, message: RESOURCE($.language, 'error.password.mismatch') });
                    return;
                }

                set.passwordHash = model.password.hash(process.env.USER_HASH_TYPE, process.env.USER_HASH_SALT);
            }

            let update = await MDB.updateOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID($.user._id) }, set);

            if (isDbError(update)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            await REDIS.hset(process.env.REDIS_DB_SESSION, $.controller.cookie(CONF.cookieAuthName), 'language', set.language);

            if ($.controller) {
                $.controller.cookie(CONF.cookieLangName, set.language, '30 days');
            }

            FUNC.logger($, `Users/Users save (own profile): ${$.user._id}`);
            $.callback({ success: true });
        }
    });

    // Admin: a MÁR manager jogosultsággal rendelkező (+ sa) felhasználók
    // listája — kizárólag a diploma-szerkesztőn a felelős manager kiválasztó
    // legördülőjéhez kell (lásd schemas/diplomas/diplomas.js 'save' action
    // managerId-ellenőrzése) —, ezért bármelyik manager (nem csak sa)
    // lekérheti. A teljes (bármely regisztrált felhasználó közötti) keresés és
    // a manager-jogosultság kiosztása/tiltás a `/admin/users` superadmin-only
    // felhasználó-kezelőben van (lásd adminList/adminGet/setStatus/setManager
    // lent) — ez a `query` action itt SZÁNDÉKOSAN szűk körű maradt, nem
    // bővítettem ki, mert más helyen (diploma-szerkesztő) is hívja.
    //
    // A `sa` felhasználókat IS beleérti, még ha a `permissions` tömbjükben
    // nincs is ott szó szerint a 'manager' string (a superadmin jogosultsága
    // nem azon a mezőn keresztül működik, hanem a keretrendszer automatikus
    // sa-bypass-ával) — enélkül a superadmin soha nem jelenne meg a
    // diploma-szerkesztő felelős manager választóján, holott ténylegesen ő is
    // el tudja/kell tudja látni ezt a szerepet.
    schema.action('query', {
        action: async function ($) {
            let isManager = !!($.user && ($.user.sa || ($.user.permissions || []).indexOf('manager') !== -1));

            if (!isManager) {
                $.callback({ success: false });
                return;
            }

            let result = await MDB.find(process.env.MONGODB_DB_NAME, 'users', { $or: [{ permissions: 'manager' }, { sa: true }] }, {
                projection: { passwordHash: 0, 'mfa.totpSecret': 0 }
            }, { email: 1 }, 50);

            if (isDbError(result)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            $.callback({ success: true, data: result });
        }
    });

    // --- Superadmin-only felhasználó-kezelő (/admin/users, felhasználói kérésre) ---
    // Lapozható/kereshető lista (email/hívójel/név szerint, szabad szöveges
    // keresés), egyedi adatlap, tiltás/visszakapcsolás (users.status
    // 'active'<->'disabled' — a login action MÁR MOST elutasítja a nem
    // 'active' állapotú fiókot, lásd a 'login' actiont fent, ezért ehhez nem
    // kellett új tiltás-logika, csak ez az admin-oldali kapcsoló). A
    // manager-jogosultság kiosztása/visszavonása a MEGLÉVŐ setManager
    // actiont hívja (lásd lent) — az korábban a settings-admin oldal
    // "Diploma-managerek" szekciójából volt hívva, onnan a felhasználói
    // kérésre ide, a user-kezelőbe költözött (konszolidáció, hogy egy helyen
    // legyen minden user-admin funkció).
    schema.action('adminList', {
        action: async function ($) {
            if (!$.user || !$.user.sa) {
                $.callback({ success: false });
                return;
            }

            let page = Number($.query.page) || 0;
            let max = Number($.query.max) || 25;
            let query = {};

            if ($.query.status) {
                query.status = $.query.status;
            }

            if ($.query.q) {
                let re = new RegExp($.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                query.$or = [{ email: re }, { callsign: re }, { firstName: re }, { lastName: re }];
            }

            let result = await MDB.find(process.env.MONGODB_DB_NAME, 'users', query, {
                projection: { passwordHash: 0, 'mfa.totpSecret': 0 },
                skip: page * max
            }, { created: -1 }, max, true);

            if (isDbError(result)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            $.callback({ success: true, countFull: result.countFull, data: result.data });
        }
    });

    schema.action('adminGet', {
        action: async function ($) {
            if (!$.user || !$.user.sa) {
                $.callback({ success: false });
                return;
            }

            let user = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID($.params.id) }, {
                projection: { passwordHash: 0, 'mfa.totpSecret': 0 }
            });

            if (isDbError(user) || !user) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            $.callback({ success: true, data: user });
        }
    });

    schema.action('setStatus', {
        input: '*status:string',
        language: true,
        action: async function ($) {
            if (!$.user || !$.user.sa) {
                $.callback({ success: false });
                return;
            }

            if (['active', 'disabled'].indexOf($.model.status) === -1) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            let target = await MDB.findOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID($.params.id) }, { projection: { sa: 1 } });

            if (isDbError(target) || !target) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            // Superadmin fiók tiltása szándékosan tiltva innen (véletlen
            // kizárás elkerülése — beleértve a saját fiókot is, hiszen a
            // hívó user is 'sa').
            if (target.sa) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.user.cannot_disable_sa') });
                return;
            }

            let update = await MDB.updateOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID($.params.id) }, { status: $.model.status, updated: new Date() });

            if (isDbError(update)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            FUNC.logger($, `Users/Users setStatus: ${$.params.id} -> ${$.model.status}`);
            $.callback({ success: true });
        }
    });

    schema.action('setManager', {
        input: '*id:string, *manager:bool',
        language: true,
        action: async function ($) {
            if (!$.user || !$.user.sa) {
                $.callback({ success: false });
                return;
            }

            let manager = !!$.model.manager;
            let updateDoc = manager
                ? { $addToSet: { permissions: 'manager' }, $set: { updated: new Date() } }
                : { $pull: { permissions: 'manager' }, $set: { updated: new Date() } };

            let update = await MDB.updateOne(process.env.MONGODB_DB_NAME, 'users', { _id: MDB.ObjectID($.model.id) }, updateDoc, false, false);

            if (isDbError(update)) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            FUNC.logger($, `Users/Users setManager: ${$.model.id} -> ${manager}`);
            $.callback({ success: true });
        }
    });
});

function isDbError(result) {
    return Array.isArray(result) && result[0] != null && result[0].error != null;
}

// A SUPERUSER_EMAIL env változó vesszővel elválasztva TÖBB e-mail címet is
// tartalmazhat (pl. ha a fő superadmin nyaral, legyen egy másik fiók is, ami
// regisztrációkor automatikusan superadmin lesz) — lásd docker/dev.env. Csak
// REGISZTRÁCIÓKOR fut le (lásd a 'register' actiont): ha valaki már korábban,
// nem-superadminként regisztrált, és utólag kerül be az e-mailje ebbe a
// listába, az ő meglévő fiókja ettől even NEM válik automatikusan sa-vá — azt
// egy managernek/superadminnak kézzel (Mongóban) kell utólag beállítania,
// ehhez itt nincs admin UI (a `sa` mező szándékosan nincs kiosztható a
// settings-admin "Diploma-managerek" szekciójából sem, lásd ott a kommentet —
// az csak a 'manager' permissiont kezeli, nem a superadmin flaget).
function isSuperuserEmail(email) {
    let list = (process.env.SUPERUSER_EMAIL || '').split(',').map(e => e.toLowerCase().trim()).filter(e => e);
    return list.indexOf((email || '').toLowerCase().trim()) !== -1;
}

function formatName(lang, firstName, lastName) {
    return lang === 'hu' ? `${lastName} ${firstName}` : `${firstName} ${lastName}`;
}

function make6DigitCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function sendMfaCodeEmail($, user, code) {
    MAIL(user.email, RESOURCE($.language, 'email.mfa.subject'), 'login/email-mfa', {
        greeting: RESOURCE($.language, 'email.greeting'),
        name: formatName($.language, user.firstName, user.lastName),
        mfa_code: code,
        ttl_label: RESOURCE($.language, 'email.mfa.ttl').replace('{0}', String(Math.round(Number(process.env.TTL_MFA_PENDING) / 60))),
        footer: RESOURCE($.language, 'email.footer')
    }, $.language, function (err) {
        if (err) FUNC.logger($, `Email ERROR (mfa): ${user.email} -> ${err}`);
    });
}

// Session létrehozása Redisben + auth/lang cookie beállítása. Közös a "nincs
// MFA" login ágnak és a két MFA-lezáró actionnek (mfaSetupConfirm, mfaVerify).
async function createSession($, user) {
    let sessionId = GUID(40);
    let ttlSession = Number(process.env.TTL_SESSION);

    await REDIS.hset(process.env.REDIS_DB_SESSION, sessionId, '_id', String(user._id));
    await REDIS.hset(process.env.REDIS_DB_SESSION, sessionId, 'email', user.email);
    await REDIS.hset(process.env.REDIS_DB_SESSION, sessionId, 'sa', String(!!user.sa));
    await REDIS.hset(process.env.REDIS_DB_SESSION, sessionId, 'permissions', (user.permissions || []).join(','));
    await REDIS.hset(process.env.REDIS_DB_SESSION, sessionId, 'ua', ($.headers && $.headers['user-agent']) || '');
    await REDIS.hset(process.env.REDIS_DB_SESSION, sessionId, 'language', user.language || 'hu');
    await REDIS.expire(process.env.REDIS_DB_SESSION, sessionId, ttlSession);

    if ($.controller) {
        $.controller.cookie(CONF.cookieAuthName, sessionId, ttlSession + ' seconds', { httpOnly: true });
        $.controller.cookie(CONF.cookieLangName, user.language || 'hu', '30 days');
    }
}
