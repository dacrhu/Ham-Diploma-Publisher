// Env változók és a `src/config` defaultjainak összefésülése.
// Docker alatt a docker/dev.env-ben megadott (HDP_ prefix NÉLKÜLI) kulcsok
// felülírják a config HDP_-prefixű defaultjait — de csak akkor, ha a
// process.env-ben még nincs az adott kulcs beállítva.
const MAIL_ENV_MAP = { MAIL_SMTP: 'mail_smtp', MAIL_SMTP_OPTIONS: 'mail_smtp_options', MAIL_FROM: 'mail_from' };
for (const [envKey, confKey] of Object.entries(MAIL_ENV_MAP)) {
    if (process.env[envKey]) {
        CONF[confKey] = (confKey === 'mail_smtp_options') ? JSON.parse(process.env[envKey]) : process.env[envKey];

        if (DEBUG) {
            console.log('set CONF:', confKey, '=', CONF[confKey]);
        }
    }
}

// A Total.js saját (nem HDP_-prefixű, ezért a lenti generikus HDP_-hurok által
// NEM érintett) `secret`/`encryptKey` CONF-kulcsai — session-cookie aláírás,
// ill. titkosítás — Docker/Kubernetes-kompatibilitás miatt (felhasználói
// kérésre) itt is env változóból felülírhatók, hogy egy K8s Secret/ConfigMap
// egyszerű env-injektálással működjön, ne kelljen a `src/config` fájlt magát
// (aminek EGYÉBKÉNT is csak egy `src/config.example` sablonja van
// verziókövetve, lásd ott) titkokkal kézzel karbantartani egy adott
// környezethez. SZÁNDÉKOSAN nincs DEBUG-log a tényleges ÉRTÉKről (csak arról,
// hogy felülírás történt-e) — titkot sosem írunk logba.
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
