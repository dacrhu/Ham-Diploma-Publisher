// Making the `stripe` npm package globally available — used both for creating a
// Stripe Checkout Session (Submissions/Submissions `pay` action) and for
// verifying the webhook event signature (controllers/payments.js). Without
// `STRIPE_SECRET_KEY` (dev env, no real key yet) `global.STRIPE` stays
// `null` — callers MUST CHECK before using it (see
// error.payment.provider.unavailable).
global.STRIPE = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
