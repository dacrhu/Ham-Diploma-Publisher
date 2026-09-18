// payment-pricing.js — a diploma pricing{pdfFee,physicalFee,currency} mezőjéből
// a ténylegesen fizetendő összeg kiszámítása egy adott beadványhoz. A
// `physicalFee` mindig FELÁR a `pdfFee`-hez képest (lásd
// diplomas.fee.physical.label resource-szöveg: "Fizikai példány díja
// (felár)") — tehát fizikai kézbesítésnél a kettő ÖSSZEADÓDIK, nem csak a
// physicalFee számít.
global.PAYMENT_PRICING = {};

PAYMENT_PRICING.calculateFee = function (diploma, deliveryChoice) {
    let pricing = diploma && diploma.pricing;
    let pdfFee = Math.max(0, Number(pricing && pricing.pdfFee) || 0);
    let physicalFee = Math.max(0, Number(pricing && pricing.physicalFee) || 0);

    return deliveryChoice === 'physical' ? pdfFee + physicalFee : pdfFee;
};

// Stripe/PayPal a legkisebb pénznem-egységben (pl. eurocent) várja az
// összeget — a rendszer mindenhol máshol a fő egységben (pl. "5" = 5 EUR)
// tárolja/jeleníti meg. Csak a gyakori, 2 tizedesjegyes (100 alegységes)
// pénznemeket kezeli (EUR/USD/GBP stb.) — ez a projekt eddigi egyetlen
// ténylegesen használt pénzneme (EUR) is, nincs igény nulla-tizedesjegyes
// (pl. JPY/HUF) pénznemek külön kezelésére.
PAYMENT_PRICING.toMinorUnits = function (amount) {
    return Math.round(Number(amount) * 100);
};
