// Building links used in emails (absolute, with domain).
FUNC.emailLink = function (pathWithQuery) {
    return `http://${process.env.APP_DOMAIN}${pathWithQuery}`;
};
