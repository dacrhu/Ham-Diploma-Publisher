// A `stripe` npm csomag globális elérhetővé tétele — Stripe Checkout Session
// létrehozásához (Submissions/Submissions `pay` action) és a webhook-esemény
// aláírás-ellenőrzéséhez (controllers/payments.js) egyaránt. `STRIPE_SECRET_KEY`
// hiányában (fejlesztői env, még nincs valódi kulcs) `global.STRIPE` marad
// `null` — a hívó helyeknek ELLENŐRIZNIÜK kell, mielőtt használnák (lásd
// error.payment.provider.unavailable).
global.STRIPE = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
