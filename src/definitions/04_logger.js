// Audit log: minden lényeges műveletnél FUNC.logger($, message) hívással naplózunk.
// $ lehet a teljes Total.js request-context ($ paraméter egy schema actionben),
// vagy egy minimál { user, ip, req, res } alakú objektum is (lásd 01_auth.js).
FUNC.logger = function ($, message) {
    let ip = $.ip;
    if (process.env.LOG_IP_HEADER && $.req) {
        ip = $.req.headers[process.env.LOG_IP_HEADER] || ip;
    }
    let user = $.user || {};
    console.log(`${new Date().toISOString()} | ${ip} | ${$.res ? $.res.statusCode : '-'} | ${user._id || '-'} | ${user.email || '-'} | ${message}`);
};
