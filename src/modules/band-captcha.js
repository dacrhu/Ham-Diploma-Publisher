// band-captcha.js — a "captcha" for registration that requires radio-amateur
// knowledge (at the user's request, against bots): we show a frequency (kHz)
// and the user has to guess, multiple-choice, which amateur band it falls into.
//
// The band edges follow the IARU Region 1 (Europe) licensed amateur bands
// — DELIBERATELY only the sufficiently WIDE/unambiguous bands are included here
// (the narrow/channelized 2200m, 630m, 60m are left out), so that the chosen
// frequency falls well within the band edges with a safe margin, avoiding
// ambiguity near the edges. A complete ADIF/ITU enumeration is not the goal
// (see the similarly, deliberately incomplete list in modules/adif-bands.js)
// — this module is used EXCLUSIVELY for captcha question generation, not for
// diploma rules.
global.BAND_CAPTCHA = {};

const BANDS = [
    { label: '160', minKHz: 1810, maxKHz: 2000 },
    { label: '80', minKHz: 3500, maxKHz: 3800 },
    { label: '40', minKHz: 7000, maxKHz: 7200 },
    { label: '30', minKHz: 10100, maxKHz: 10150 },
    { label: '20', minKHz: 14000, maxKHz: 14350 },
    { label: '17', minKHz: 18068, maxKHz: 18168 },
    { label: '15', minKHz: 21000, maxKHz: 21450 },
    { label: '12', minKHz: 24890, maxKHz: 24990 },
    { label: '10', minKHz: 28000, maxKHz: 29700 },
    { label: '6', minKHz: 50000, maxKHz: 52000 },
    { label: '2', minKHz: 144000, maxKHz: 146000 },
    { label: '70cm', minKHz: 430000, maxKHz: 440000 }
];

function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

// Picks a whole-kHz frequency within the band, with a safe margin from the
// edges (~10% of the band's width, min. 2, max. 10 kHz) — so that the question
// doesn't give a debatable value close to the band edge.
function pickFrequency(band) {
    let span = band.maxKHz - band.minKHz;
    let margin = Math.min(10, Math.max(2, Math.round(span * 0.1)));
    let lo = Math.ceil(band.minKHz + margin);
    let hi = Math.floor(band.maxKHz - margin);

    if (hi <= lo) {
        lo = band.minKHz;
        hi = band.maxKHz;
    }

    return randomInt(lo, hi);
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        let tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

// Returns a { frequencyKHz, options[4], answer } object — the `answer` is
// EXCLUSIVELY for server-side verification, it's the caller's responsibility
// not to let it reach the client (see schemas/users/users.js captchaChallenge
// action, which only returns the token+question+options, saving the answer
// to Redis).
BAND_CAPTCHA.generate = function () {
    let index = Math.floor(Math.random() * BANDS.length);
    let band = BANDS[index];
    let frequencyKHz = pickFrequency(band);

    let pool = BANDS.filter((b, i) => i !== index);
    let distractors = [];

    while (distractors.length < 3 && pool.length) {
        let i = Math.floor(Math.random() * pool.length);
        distractors.push(pool[i].label);
        pool.splice(i, 1);
    }

    let options = shuffle(distractors.concat([band.label]));

    return { frequencyKHz: frequencyKHz, options: options, answer: band.label };
};
