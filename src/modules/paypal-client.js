// paypal-client.js — vékony saját REST-kliens a PayPal Orders v2 API-hoz és a
// webhook-aláírás-ellenőrzéshez, a `fetch`-et natívan biztosító Node 22-vel
// (lásd CLAUDE.md minimális dependencia elve — nem vettünk fel hozzá külön
// npm SDK-t, a Stripe SDK-val ellentétben, mert a PayPal REST API-ja
// (OAuth2 + pár egyszerű POST) nulláról is ésszerűen megírható).
global.PAYPAL_CLIENT = {};

function baseUrl() {
    return process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

PAYPAL_CLIENT.isConfigured = function () {
    return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
};

// Az OAuth2 access tokent nem cache-eljük (a Fizetés indítása/webhook-
// feldolgozás ritka, alacsony forgalmú művelet — a cache-elés extra
// állapotot/bonyolultságot vezetne be, ami itt nem térülne meg).
async function getAccessToken() {
    let auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');

    let response = await fetch(`${baseUrl()}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });

    let json = await response.json();

    if (!response.ok || !json.access_token)
        throw new Error('PayPal OAuth error: ' + (json.error_description || response.status));

    return json.access_token;
}

// amount: fő pénznem-egységben (pl. 5 = "5.00" EUR — a PayPal Orders API a
// tizedesjegyes stringet várja, NEM a legkisebb egységet, ellentétben a
// Stripe-pal). referenceId: a submission._id (String) — erre hivatkozva
// azonosítjuk vissza a webhookban/return-oldalon, melyik beadványhoz tartozik
// a rendelés.
PAYPAL_CLIENT.createOrder = async function (amount, currency, referenceId, returnUrl, cancelUrl) {
    let token = await getAccessToken();

    let response = await fetch(`${baseUrl()}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            intent: 'CAPTURE',
            purchase_units: [{
                reference_id: referenceId,
                amount: { currency_code: currency, value: Number(amount).toFixed(2) }
            }],
            application_context: {
                return_url: returnUrl,
                cancel_url: cancelUrl,
                user_action: 'PAY_NOW'
            }
        })
    });

    let json = await response.json();

    if (!response.ok || !json.id)
        throw new Error('PayPal createOrder error: ' + (json.message || response.status));

    let approveLink = (json.links || []).find(l => l.rel === 'approve');

    return { orderId: json.id, approveUrl: approveLink ? approveLink.href : null };
};

PAYPAL_CLIENT.captureOrder = async function (orderId) {
    let token = await getAccessToken();

    let response = await fetch(`${baseUrl()}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    let json = await response.json();

    if (!response.ok)
        throw new Error('PayPal captureOrder error: ' + (json.message || response.status));

    return json;
};

// A PayPal a webhook-aláírást NEM helyben (HMAC-kal), hanem egy saját API-
// hívással ellenőrizteti (a kérés fejléceit + a nyers eseményt visszaküldve
// nekik) — ez a hivatalosan dokumentált, ajánlott módszer (ellentétben a
// Stripe-pal, ahol a titkos webhook-kulccsal helyben, HMAC-kal ellenőrzünk).
PAYPAL_CLIENT.verifyWebhookSignature = async function (headers, eventBody) {
    let token = await getAccessToken();

    let response = await fetch(`${baseUrl()}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            auth_algo: headers['paypal-auth-algo'],
            cert_url: headers['paypal-cert-url'],
            transmission_id: headers['paypal-transmission-id'],
            transmission_sig: headers['paypal-transmission-sig'],
            transmission_time: headers['paypal-transmission-time'],
            webhook_id: process.env.PAYPAL_WEBHOOK_ID,
            webhook_event: eventBody
        })
    });

    let json = await response.json();
    return json.verification_status === 'SUCCESS';
};
