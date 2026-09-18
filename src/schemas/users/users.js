// Users/Users — registration, email confirmation, login/logout, password change,
// own profile, MFA (email code / TOTP authenticator app).
//
// MFA flow (based on settings.mfaPolicyUser/mfaPolicyManager, see
// modules/settings-store.js):
//   - If MFA is already enabled on the user: after login we get back a "verify"
//     pending token -> the mfaVerify action closes this out, creates the session.
//   - If the policy is mandatory, but it's not yet enabled on the user (either
//     because they just registered, or because the manager turned on the policy
//     afterwards): after login we get a "setup" pending token -> mfaSetupSelect
//     (method selection + sending the code/QR) -> mfaSetupConfirm (checking the
//     code, this persists the user.mfa field AND also creates the session). The
//     same two actions run on the first login after registration as well — there
//     is no separate "at registration time" MFA setup, because email confirmation
//     precedes the first login anyway.
// The pending tokens live in the REDIS_DB_MFA database, for TTL_MFA_PENDING.
NEWSCHEMA('Users/Users', function (schema) {

    // Pre-registration "captcha" — at the user's request, an anti-bot check that
    // requires radio amateur knowledge (which amateur band a given frequency (kHz)
    // falls into, see modules/band-captcha.js). The correct answer is NOT sent to
    // the client — it is stored bound to a single-use token in the REDIS_DB_CAPTCHA
    // database, for TTL_CAPTCHA; the `register` action verifies it and immediately
    // invalidates it (see there).
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

            // The captcha token is SINGLE-USE — we invalidate it immediately
            // AFTER reading it (see the `.expire(...,-1)` pattern also used in the
            // login/resetPassword code), regardless of whether the answer was
            // correct, so the same token cannot be retried.
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
                // MFA is already set up on this account -> code verification is required.
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
                // The policy makes MFA mandatory, but it's not yet set up on this
                // account (new registration, or it became mandatory afterwards) ->
                // enforce setup before the session is created.
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

            // TOTP: the secret is only stored temporarily, bound to the pending
            // token — it is only written into the user document after successful
            // confirmation (mfaSetupConfirm).
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

    // --- Self-service MFA management (logged in, from the /account page) ---
    // Unlike the login-time mfaSetupSelect/Confirm, here $.user is already known
    // (the session authenticates), no password verification is needed — but we
    // also save the userId in the pending Redis record, so the confirm step can
    // verify that the token really belongs to the caller's own account.

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

            // We intentionally always return a success response (to avoid leaking
            // whether the email address exists), the email is only sent if there is a user.
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

    // Admin: list of users who ALREADY have the manager permission (+ sa) —
    // needed exclusively for the responsible-manager dropdown on the diploma
    // editor (see the managerId check in the 'save' action in
    // schemas/diplomas/diplomas.js) —, so any manager (not just sa) can call it.
    // The full (search across any registered user) search and granting/revoking
    // the manager permission live in the `/admin/users` superadmin-only user
    // manager (see adminList/adminGet/setStatus/setManager below) — this `query`
    // action here is INTENTIONALLY kept narrow in scope, I didn't extend it,
    // because it's also called elsewhere (the diploma editor).
    //
    // It ALSO includes `sa` users, even if the 'manager' string is not literally
    // present in their `permissions` array (the superadmin's permission doesn't
    // work through that field, but through the framework's automatic sa bypass)
    // — without this, the superadmin would never show up in the diploma editor's
    // responsible-manager selector, even though they can/must actually be able
    // to fill this role too.
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

    // --- Superadmin-only user manager (/admin/users, at the user's request) ---
    // Pageable/searchable list (by email/callsign/name, free-text search), an
    // individual record page, disabling/re-enabling (users.status
    // 'active'<->'disabled' — the login action ALREADY rejects an account that
    // is not in 'active' status, see the 'login' action above, so no new
    // disabling logic was needed for this, just this admin-side toggle). Granting/
    // revoking the manager permission calls the EXISTING setManager action (see
    // below) — that used to be called from the "Diploma managers" section of the
    // settings-admin page, and at the user's request it moved from there to here,
    // into the user manager (consolidation, so all user-admin functionality lives
    // in one place).
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

            // Disabling a superadmin account is intentionally forbidden from here
            // (to avoid accidental lockout — including one's own account, since
            // the calling user is also 'sa').
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

// The SUPERUSER_EMAIL env variable may contain MULTIPLE, comma-separated email
// addresses (e.g. if the main superadmin is on vacation, there should be
// another account that automatically becomes superadmin on registration) — see
// docker/dev.env. This only runs AT REGISTRATION TIME (see the 'register'
// action): if someone already registered earlier as a non-superadmin, and their
// email is added to this list afterwards, their existing account still does NOT
// automatically become sa because of this — a manager/superadmin has to set
// this manually (in Mongo) afterwards, there is no admin UI for this here (the
// `sa` field is intentionally not assignable from the settings-admin "Diploma
// managers" section either, see the comment there — that only manages the
// 'manager' permission, not the superadmin flag).
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

// Creates the session in Redis + sets the auth/lang cookie. Shared by the
// "no MFA" login branch and the two MFA-closing actions (mfaSetupConfirm, mfaVerify).
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
