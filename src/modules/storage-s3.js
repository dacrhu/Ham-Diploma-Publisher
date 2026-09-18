// storage-s3.js — S3-kompatibilis (AWS S3 / Backblaze B2 / Cloudflare R2 /
// MinIO) storage driver. Ugyanazt a driver-független API-t valósítja meg,
// mint a storage-local.js (save/read/exists/delete/serve — lásd ott a
// szerződés részletes leírását). A `serve()` NEM proxyz bájtokat a Node
// szerveren keresztül: egy rövid élettartamú, ALÁÍRT (presigned) URL-re
// irányítja át a böngészőt — ez a szokásos, hatékony S3-minta (a fájl
// tartalma közvetlenül a bucket-szolgáltatótól megy a böngészőhöz, nem
// terheli a mi szerverünk sávszélességét/memóriáját).
//
// `S3Client` példányosítása MAGÁBAN nem csinál hálózati hívást — ha
// `STORAGE_DRIVER=local` van beállítva (fejlesztői alapértelmezés), ez a
// modul akkor is betöltődik (minden `modules/` fájl automatikusan fut), de
// sose kerül ténylegesen meghívásra (lásd definitions/09_storage.js).
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

global.STORAGE_S3 = {};

STORAGE_S3.driver = 's3';

// A presigned URL érvényességi ideje — elég rövid, hogy egy esetlegesen
// megosztott/naplózott link ne maradjon sokáig felhasználható, de elég hosszú
// egy normál letöltéshez/oldalbetöltéshez.
const PRESIGN_TTL_SECONDS = 900;

const MIME_BY_EXT = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    pdf: 'application/pdf', adi: 'text/plain', adif: 'text/plain'
};

function contentTypeByKey(key) {
    let ext = String(key).split('.').pop().toLowerCase();
    return MIME_BY_EXT[ext] || 'application/octet-stream';
}

let client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    // Backblaze B2/MinIO/legtöbb S3-kompatibilis szolgáltató "path style"
    // URL-eket vár (https://endpoint/bucket/key), NEM a virtuális-host stílust
    // (https://bucket.endpoint/key), amit az AWS SDK alapértelmezésben feltesz
    // — ezért van rá külön env-kapcsoló (lásd docker/dev.env.example).
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY
    }
});

STORAGE_S3.save = async function (key, buffer) {
    await client.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentTypeByKey(key)
    }));

    return { storage: 's3', key: key };
};

STORAGE_S3.read = async function (key) {
    let response = await client.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return Buffer.from(await response.Body.transformToByteArray());
};

STORAGE_S3.exists = async function (key) {
    try {
        await client.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
        return true;
    } catch (e) {
        return false;
    }
};

STORAGE_S3.delete = async function (key) {
    try {
        await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    } catch (e) {
        // A local driver delete()-je is néma, ha a fájl már nincs ott
        // (FS.existsSync ellenőrzés előtte) — itt a legegyszerűbb ezt egy
        // "nem létezik" hibánál ugyanígy elnyelni, konzisztensen.
    }
};

STORAGE_S3.serve = async function (self, key, downloadName) {
    let command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName}"` : undefined
    });

    let url = await getSignedUrl(client, command, { expiresIn: PRESIGN_TTL_SECONDS });
    self.redirect(url);
};
