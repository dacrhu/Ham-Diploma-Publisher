// Merging env variables with `src/config`'s defaults.
// Under Docker, the keys given in docker/dev.env (WITHOUT the HDP_ prefix)
// override the config's HDP_-prefixed defaults — but only if that key isn't
// already set in process.env.
const MAIL_ENV_MAP = { MAIL_SMTP: 'mail_smtp', MAIL_SMTP_OPTIONS: 'mail_smtp_options', MAIL_FROM: 'mail_from' };
for (const [envKey, confKey] of Object.entries(MAIL_ENV_MAP)) {
    if (process.env[envKey]) {
        CONF[confKey] = (confKey === 'mail_smtp_options') ? JSON.parse(process.env[envKey]) : process.env[envKey];

        if (DEBUG) {
            console.log('set CONF:', confKey, '=', CONF[confKey]);
        }
    }
}

// Total.js's own (not HDP_-prefixed, so NOT affected by the generic HDP_ loop
// below) `secret`/`encryptKey` CONF keys — session-cookie signing and
// encryption respectively — can also be overridden here from env variables,
// for Docker/Kubernetes compatibility (at the user's request), so that a K8s
// Secret/ConfigMap works via simple env injection, without having to manually
// maintain the `src/config` file itself (which ANYWAY only has a
// `src/config.example` template version-controlled, see there) with secrets
// for a given environment. DELIBERATELY no DEBUG log of the actual VALUE (only
// of whether an override happened) — we never log a secret.
const SECRET_ENV_MAP = { SECRET: 'secret', ENCRYPT_KEY: 'encryptKey' };
for (const [envKey, confKey] of Object.entries(SECRET_ENV_MAP)) {
    if (process.env[envKey]) {
        CONF[confKey] = process.env[envKey];

        if (DEBUG) {
            console.log('set CONF from env (value hidden):', confKey);
        }
    }
}

let conf_obj = Object.keys(CONF);

for (let i = 0, n = conf_obj.length; i < n; i++) {
    if (conf_obj[i].indexOf('HDP_') === 0 && !process.env[conf_obj[i].replace('HDP_', '')]) {
        process.env[conf_obj[i].replace('HDP_', '')] = CONF[conf_obj[i]];

        if (DEBUG) {
            console.log('set variable with default:', conf_obj[i].replace('HDP_', ''), '=', CONF[conf_obj[i]]);
        }
    }
}
