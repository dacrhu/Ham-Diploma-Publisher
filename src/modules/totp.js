// totp.js — RFC 6238 (TOTP) / RFC 4226 (HOTP) minimál, saját implementáció Node
// beépített `crypto`-jával — nincs szükség külön npm csomagra. A secret Base32
// kódolású (RFC 4648, "="-padding nélkül), ahogy az authenticator appok (Google
// Authenticator, Authy stb.) elvárják.
const crypto = require('crypto');

global.TOTP = {};

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD = 30;
const DIGITS = 6;

function base32Encode(buffer) {
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < buffer.length; i++) {
        value = (value << 8) | buffer[i];
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0)
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];

    return output;
}

function base32Decode(base32) {
    base32 = (base32 || '').toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');

    let bits = 0;
    let value = 0;
    let bytes = [];

    for (let i = 0; i < base32.length; i++) {
        let idx = BASE32_ALPHABET.indexOf(base32[i]);
        if (idx === -1)
            continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }

    return Buffer.from(bytes);
}

// Új, véletlenszerű secret előállítása (alap: 20 byte = 160 bit, ez a szokásos
// TOTP secret-hossz, Base32-ben kódolva).
TOTP.generateSecret = function (byteLength) {
    return base32Encode(crypto.randomBytes(byteLength || 20));
};

// HOTP kód (RFC 4226) egy adott számlálóértékre.
function hotp(secretBuffer, counter, digits) {
    let counterBuffer = Buffer.alloc(8);
    // A számláló 64 bites, de a mi időintervallumainkkal soha nem éri el a
    // Number.MAX_SAFE_INTEGER-t, ezért a felső 4 byte mindig 0 marad.
    counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuffer.writeUInt32BE(counter >>> 0, 4);

    let hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
    let offset = hmac[hmac.length - 1] & 0x0f;
    let binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
    let otp = binary % Math.pow(10, digits);

    return String(otp).padStart(digits, '0');
}

// TOTP kód generálása a megadott (vagy jelenlegi) időpontra.
TOTP.generate = function (base32Secret, forTimeMs, period, digits) {
    period = period || PERIOD;
    digits = digits || DIGITS;
    let counter = Math.floor((forTimeMs == null ? Date.now() : forTimeMs) / 1000 / period);
    return hotp(base32Decode(base32Secret), counter, digits);
};

// TOTP kód ellenőrzése — `window` lépéssel korábbi/későbbi időablakot is elfogad
// (óra-csúszás tolerancia), alapértelmezetten ±1 (azaz ±30 mp).
TOTP.verify = function (base32Secret, token, window, period, digits) {
    if (!token)
        return false;

    token = String(token).trim();
    window = window == null ? 1 : window;
    period = period || PERIOD;

    let now = Date.now();

    for (let i = -window; i <= window; i++) {
        let candidate = TOTP.generate(base32Secret, now + i * period * 1000, period, digits);
        if (candidate === token)
            return true;
    }

    return false;
};

// otpauth:// URI az authenticator appban való beolvasáshoz (QR-kód forrása).
TOTP.keyUri = function (base32Secret, accountEmail, issuer) {
    let label = encodeURIComponent(issuer) + ':' + encodeURIComponent(accountEmail);
    return `otpauth://totp/${label}?secret=${base32Secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`;
};
