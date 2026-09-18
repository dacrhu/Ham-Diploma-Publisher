// paypal-client.js — thin custom REST client for the PayPal Orders v2 API and
// webhook signature verification, using Node 22's native `fetch`
// (see CLAUDE.md's minimal-dependency principle — we did not add a separate
// npm SDK for it, unlike the Stripe SDK, because PayPal's REST API
// (OAuth2 + a couple of simple POSTs) can reasonably be written from scratch).
global.PAYPAL_CLIENT = {};

function baseUrl() {
    return process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

PAYPAL_CLIENT.isConfigured = function () {
    return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
};

// We don't cache the OAuth2 access token (starting a payment/processing a
// webhook is a rare, low-traffic operation — caching would introduce extra
// state/complexity that wouldn't pay off here).
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

// amount: in the main currency unit (e.g. 5 = "5.00" EUR — the PayPal Orders API
// expects the decimal string, NOT the smallest unit, unlike Stripe).
// referenceId: the submission._id (String) — used to identify, in the
// webhook/return page, which submission the order belongs to.
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

// PayPal does NOT verify the webhook signature locally (with HMAC), but via a
// dedicated API call (sending back the request headers + the raw event to
// them) — this is the officially documented, recommended method (unlike
// Stripe, where we verify locally with HMAC using the secret webhook key).
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
