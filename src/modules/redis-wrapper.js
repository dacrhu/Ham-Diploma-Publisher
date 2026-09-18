// Redis wrapper — egyedi minimál lib, a technológiai példaprojekt (EHS4) mintája alapján.
// Session (db=HDP_REDIS_DB_SESSION), MFA-kód (db=HDP_REDIS_DB_MFA), jelszó-reset
// (db=HDP_REDIS_DB_CHANGE_PASSWORD) és e-mail megerősítés (db=HDP_REDIS_DB_EMAIL_VERIFY)
// célra használt kulcs-érték / hash tárolás.
const {
    createClient
} = require("redis");

global.REDIS = function (err, res) {
    return (err, res);
};

REDIS.expire = async function (database, key, seconds) {
    const client = createClient({
        url: process.env.MODULE_REDIS_WRAPPER_CONNECTION_STRING
    });
    client.on('error', (err) => console.log('Redis Client Error', err));

    try {
        await client.connect();
        await client.SELECT(database);
        return await client.EXPIRE(key, seconds);
    } catch (error) {
        return ([{
            error: error
        }])
    } finally {
        await client.disconnect();
    }
};

REDIS.hset = async function (database, key, field, value) {
    const client = createClient({
        url: process.env.MODULE_REDIS_WRAPPER_CONNECTION_STRING
    });
    client.on('error', (err) => console.log('Redis Client Error', err));

    try {
        await client.connect();
        await client.SELECT(database);
        return await client.HSET(key, field, value);
    } catch (error) {
        return ([{
            error: error
        }])
    } finally {
        await client.disconnect();
    }
};

REDIS.hgetall = async function (database, key) {
    const client = createClient({
        url: process.env.MODULE_REDIS_WRAPPER_CONNECTION_STRING
    });
    client.on('error', (err) => console.log('Redis Client Error', err));

    try {
        await client.connect();
        await client.SELECT(database);
        return await client.HGETALL(key);
    } catch (error) {
        return ([{
            error: error
        }])
    } finally {
        await client.disconnect();
    }
};

REDIS.del = async function (database, key) {
    const client = createClient({
        url: process.env.MODULE_REDIS_WRAPPER_CONNECTION_STRING
    });
    client.on('error', (err) => console.log('Redis Client Error', err));

    try {
        await client.connect();
        await client.SELECT(database);
        return await client.DEL(key);
    } catch (error) {
        return ([{
            error: error
        }])
    } finally {
        await client.disconnect();
    }
};
