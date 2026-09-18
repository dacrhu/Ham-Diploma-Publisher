// E-mailekben használt (abszolút, domainnel ellátott) linkek összeállítása.
FUNC.emailLink = function (pathWithQuery) {
    return `http://${process.env.APP_DOMAIN}${pathWithQuery}`;
};
