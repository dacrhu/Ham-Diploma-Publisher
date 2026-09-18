// payment-pricing.js — calculates the amount actually payable for a given
// submission from the diploma's pricing{pdfFee,physicalFee,currency} field. The
// `physicalFee` is always a SURCHARGE on top of the `pdfFee` (see the
// diplomas.fee.physical.label resource string: "Physical copy fee
// (surcharge)") — so for physical delivery the two are ADDED TOGETHER, not
// just physicalFee alone.
global.PAYMENT_PRICING = {};

PAYMENT_PRICING.calculateFee = function (diploma, deliveryChoice) {
    let pricing = diploma && diploma.pricing;
    let pdfFee = Math.max(0, Number(pricing && pricing.pdfFee) || 0);
    let physicalFee = Math.max(0, Number(pricing && pricing.physicalFee) || 0);

    return deliveryChoice === 'physical' ? pdfFee + physicalFee : pdfFee;
};

// Stripe/PayPal expects the amount in the smallest currency unit (e.g.
// eurocent) — everywhere else the system stores/displays it in the main unit
// (e.g. "5" = 5 EUR). Only handles common, 2-decimal (100-subunit) currencies
// (EUR/USD/GBP etc.) — this is also the only currency actually used by this
// project so far (EUR); there's no need to separately handle zero-decimal
// currencies (e.g. JPY/HUF).
PAYMENT_PRICING.toMinorUnits = function (amount) {
    return Math.round(Number(amount) * 100);
};
