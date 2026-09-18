// band-captcha.js — rádióamatőr-tudást igénylő "captcha" a regisztrációhoz
// (felhasználói kérésre, botok ellen): egy frekvenciát (kHz) mutatunk, és
// feleletválasztósan kell eltalálni, melyik amatőrsávba esik.
//
// A sávhatárok az IARU 1. régió (Európa) engedélyezett amatőr sávjai szerintiek
// — SZÁNDÉKOSAN csak a kellően SZÉLES/egyértelmű sávok szerepelnek itt (a
// keskeny/csatornázott 2200m, 630m, 60m kimaradt), hogy a frekvencia-választás
// biztos margóval a sávszélek közé essen, elkerülve a szélek körüli
// kétértelműséget. Nem cél a teljes ADIF/ITU enumeráció (lásd
// modules/adif-bands.js hasonló, szándékosan nem teljes listája) — ez a modul
// KIZÁRÓLAG a captcha kérdésgeneráláshoz kell, nem a diploma-szabályokhoz.
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

// Egész kHz-es frekvenciát választ a sávon belül, a szélektől biztos
// margóval (a sáv szélességének ~10%-a, min. 2, max. 10 kHz) — hogy a kérdés
// ne egy vitatható, sávszél-közeli értéket adjon.
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

// Visszaad egy { frequencyKHz, options[4], answer } objektumot — az `answer`
// KIZÁRÓLAG szerveroldali ellenőrzéshez kell, a hívó felelőssége, hogy ne
// kerüljön ki a kliensnek (lásd schemas/users/users.js captchaChallenge
// actionje, ami csak a token+kérdés+opciókat adja vissza, az answert Redisbe
// menti).
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
