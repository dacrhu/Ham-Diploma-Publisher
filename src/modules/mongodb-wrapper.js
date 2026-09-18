// MongoDB wrapper — egyedi minimál lib, a technológiai példaprojekt (EHS4) mintája alapján.
// Minden metódus önálló kapcsolatot nyit és zár (nincs connection pool a wrapper szintjén).
// Hiba esetén a visszatérési érték `[{error}]` — a hívó ezt ellenőrzi.
const {
    MongoClient,
    ServerApiVersion
} = require("mongodb");

global.MDB = function (err, res) {
    return (err, res);
};

function mongoConnect() {
    if (U.parseBoolean(process.env.MODULE_MONGODB_WRAPPER_X509)) {
        return new MongoClient(process.env.MODULE_MONGODB_WRAPPER_CONNECTION_STRING, {
            sslKey: PATH.private('mongo.pem'),
            sslCert: PATH.private('mongo.pem'),
            serverApi: ServerApiVersion.v1
        });
    } else {
        return new MongoClient(process.env.MODULE_MONGODB_WRAPPER_CONNECTION_STRING);
    }
}

MDB.ObjectID = function (id) {
    let mongo = require('mongodb');
    let mongooid = new mongo.ObjectId(id);
    return mongooid;
};

MDB.checkExist = async function (database, collection, query) {
    let DB = mongoConnect();
    try {
        await DB.connect();
        const iDatabase = DB.db(database);
        const iCollection = iDatabase.collection(collection);
        let cursor = iCollection.findOne(query, {
            projection: {
                _id: 1
            }
        });
        return await cursor;
    } catch (error) {
        return ([{
            error: error
        }])
    } finally {
        await DB.close();
    }
};

MDB.findOne = async function (database, collection, query, options) {
    let DB = mongoConnect();
    try {
        await DB.connect();
        const iDatabase = DB.db(database);
        const iCollection = iDatabase.collection(collection);
        let cursor = iCollection.findOne(query, options || {});
        return await cursor;
    } catch (error) {
        return ([{
            error: error
        }])
    } finally {
        await DB.close();
    }
};

MDB.find = async function (database, collection, query, options, sort, limit, count = false, language = 'hu') {
    let DB = mongoConnect();
    try {
        await DB.connect();
        const iDatabase = DB.db(database);
        const iCollection = iDatabase.collection(collection);
        let cursor = iCollection.find(query || {}, options || {}).sort(sort || {}).limit(limit || 0).collation({locale: language, numericOrdering: true});
        if (count) {
            let countFull = await iCollection.countDocuments(query || {});
            return {
                countFull: countFull,
                data: await cursor.toArray()
            };
        } else {
            return await cursor.toArray();
        }
    } catch (error) {
        return ([{
            error: error
        }])
    } finally {
        await DB.close();
    }
};

MDB.insertOne = async function (database, collection, doc) {
    let DB = mongoConnect();
    try {
        await DB.connect();
        const iDatabase = DB.db(database);
        const iCollection = iDatabase.collection(collection);
        return await iCollection.insertOne(doc);
    } catch (error) {
        return ([{
            error: error
        }])
    } finally {
        await DB.close();
    }
};

MDB.updateOne = async function (database, collection, filter, doc, upsert = false, set = true) {
    let DB = mongoConnect();
    try {
        await DB.connect();
        const iDatabase = DB.db(database);
        const iCollection = iDatabase.collection(collection);
        if (set) {
            return await iCollection.updateOne(filter, {
                $set: doc
            }, {
                upsert: upsert
            });
        } else {
            return await iCollection.updateOne(filter, doc, {
                upsert: upsert
            });
        }
    } catch (error) {
        return ([{
            error: error
        }])
    } finally {
        await DB.close();
    }
};

MDB.deleteOne = async function (database, collection, query) {
    let DB = mongoConnect();
    try {
        await DB.connect();
        const iDatabase = DB.db(database);
        const iCollection = iDatabase.collection(collection);
        return await iCollection.deleteOne(query);
    } catch (error) {
        return ([{
            error: error
        }])
    } finally {
        await DB.close();
    }
};

MDB.deleteMany = async function (database, collection, query) {
    let DB = mongoConnect();
    try {
        await DB.connect();
        const iDatabase = DB.db(database);
        const iCollection = iDatabase.collection(collection);
        return await iCollection.deleteMany(query);
    } catch (error) {
        return ([{
            error: error
        }])
    } finally {
        await DB.close();
    }
};

MDB.aggregate = async function (database, collection, pipeline) {
    let DB = mongoConnect();
    try {
        await DB.connect();
        const iDatabase = DB.db(database);
        const iCollection = iDatabase.collection(collection);
        let cursor = iCollection.aggregate(pipeline);
        return await cursor.toArray();
    } catch (error) {
        return ([{
            error: error
        }])
    } finally {
        await DB.close();
    }
};

MDB.ensureIndexes = async function (database, collection, indexes) {
    let DB = mongoConnect();
    try {
        await DB.connect();
        const iDatabase = DB.db(database);
        const iCollection = iDatabase.collection(collection);
        return await iCollection.createIndexes(indexes);
    } catch (error) {
        return ([{
            error: error
        }])
    } finally {
        await DB.close();
    }
};

MDB.findOneAndUpdate = async function (database, collection, filter, update, options = {}) {
    let DB = mongoConnect();
    try {
        await DB.connect();
        const iDatabase = DB.db(database);
        const iCollection = iDatabase.collection(collection);

        // A driver újabb verzióiban `returnDocument` kell `returnOriginal` helyett —
        // mindig a frissített dokumentumot adjuk vissza alapértelmezésben.
        const finalOptions = {
            ...options,
            returnDocument: options.returnDocument || 'after'
        };

        return await iCollection.findOneAndUpdate(filter, update, finalOptions);
    } catch (error) {
        return ([{
            error: error
        }])
    } finally {
        await DB.close();
    }
};
