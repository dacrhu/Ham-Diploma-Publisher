// MongoDB wrapper — a custom minimal lib, based on the pattern of the technology reference project (EHS4).
// Every method opens and closes its own connection (no connection pool at the wrapper level).
// On error the return value is `[{error}]` — the caller checks this.
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

        // Newer driver versions require `returnDocument` instead of `returnOriginal` —
        // by default we always return the updated document.
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
