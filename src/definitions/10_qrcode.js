// Making the `qrcode` npm package globally available — used by the Users/Users
// schema (mfaSetupSelect) to generate the TOTP enrollment QR code (data URL PNG).
global.QRCode = require('qrcode');
