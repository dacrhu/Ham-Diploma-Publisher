// Audit log: every significant operation is logged via a FUNC.logger($, message) call.
// $ can be the full Total.js request context (the $ parameter in a schema action),
// or a minimal object of the shape { user, ip, req, res } (see 01_auth.js).
FUNC.logger = function ($, message) {
    let ip = $.ip;
    if (process.env.LOG_IP_HEADER && $.req) {
        ip = $.req.headers[process.env.LOG_IP_HEADER] || ip;
    }
    let user = $.user || {};
    console.log(`${new Date().toISOString()} | ${ip} | ${$.res ? $.res.statusCode : '-'} | ${user._id || '-'} | ${user.email || '-'} | ${message}`);
};
