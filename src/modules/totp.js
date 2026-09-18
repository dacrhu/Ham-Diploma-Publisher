// totp.js — minimal, custom implementation of RFC 6238 (TOTP) / RFC 4226 (HOTP)
// using Node's built-in `crypto` — no need for a separate npm package. The
// secret is Base32-encoded (RFC 4648, without "=" padding), as expected by
// authenticator apps (Google Authenticator, Authy, etc.).
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

// Generates a new, random secret (default: 20 bytes = 160 bits, the usual
// TOTP secret length, Base32-encoded).
TOTP.generateSecret = function (byteLength) {
    return base32Encode(crypto.randomBytes(byteLength || 20));
};

// HOTP code (RFC 4226) for a given counter value.
function hotp(secretBuffer, counter, digits) {
    let counterBuffer = Buffer.alloc(8);
    // The counter is 64-bit, but with our time intervals it never reaches
    // Number.MAX_SAFE_INTEGER, so the upper 4 bytes always stay 0.
    counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuffer.writeUInt32BE(counter >>> 0, 4);

    let hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
    let offset = hmac[hmac.length - 1] & 0x0f;
    let binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
    let otp = binary % Math.pow(10, digits);

    return String(otp).padStart(digits, '0');
}

// Generates a TOTP code for the given (or current) time.
TOTP.generate = function (base32Secret, forTimeMs, period, digits) {
    period = period || PERIOD;
    digits = digits || DIGITS;
    let counter = Math.floor((forTimeMs == null ? Date.now() : forTimeMs) / 1000 / period);
    return hotp(base32Decode(base32Secret), counter, digits);
};

// Verifies a TOTP code — with a `window` step, also accepts an earlier/later
// time window (clock-drift tolerance), defaulting to ±1 (i.e. ±30 sec).
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

// otpauth:// URI for scanning into an authenticator app (source for the QR code).
TOTP.keyUri = function (base32Secret, accountEmail, issuer) {
    let label = encodeURIComponent(issuer) + ':' + encodeURIComponent(accountEmail);
    return `otpauth://totp/${label}?secret=${base32Secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`;
};
