// Total.js AUTH hook — minden requestnél lefut. A `$.user`-t tölti fel a Redis-ben
// tárolt session alapján; a tényleges hozzáférés-korlátozást a ROUTE '+' prefixe és
// a schema action `permissions` mezője végzi (Total.js natív mechanizmus).
AUTH(async function ($) {
    let cookie = $.cookie(CONF.cookieAuthName);

    if (!cookie) {
        $.invalid();
        return;
    }

    let session = await REDIS.hgetall(process.env.REDIS_DB_SESSION, cookie);

    if (!session || !session.ua) {
        $.invalid();
        return;
    }

    if (session.ua !== $.headers['user-agent']) {
        FUNC.logger({ user: { _id: session._id, email: session.email }, ip: $.ip, req: $.req, res: $.res },
            `User-Agent mismatch -> session: ${session.ua} | header: ${$.headers['user-agent']}`);
        $.invalid();
        return;
    }

    $.success({
        _id: session._id,
        email: session.email,
        sa: (session.sa === 'true'),
        permissions: session.permissions ? session.permissions.split(',') : [],
        language: session.language,
        ua: session.ua
    });
});
