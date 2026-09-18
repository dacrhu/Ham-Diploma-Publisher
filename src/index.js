// ===================================================
// Total.js start script
// https://www.totaljs.com
// ===================================================

const options = {};

// Service mode:
options.servicemode = process.argv.indexOf('--servicemode', 1) !== -1;

var type = process.argv.indexOf('--release', 1) !== -1 ? 'release' : 'debug';
require('total4/' + type)(options);
