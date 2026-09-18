// storage-s3.js — S3-compatible (AWS S3 / Backblaze B2 / Cloudflare R2 /
// MinIO) storage driver. Implements the same driver-independent API as
// storage-local.js (save/read/exists/delete/serve — see there for the
// detailed description of the contract). `serve()` does NOT proxy bytes
// through the Node server: it redirects the browser to a short-lived, SIGNED
// (presigned) URL — this is the usual, efficient S3 pattern (the file
// content goes straight from the bucket provider to the browser, without
// burdening our server's bandwidth/memory).
//
// Instantiating `S3Client` BY ITSELF makes no network call — if
// `STORAGE_DRIVER=local` is set (the dev default), this module still loads
// (every `modules/` file runs automatically), but it never actually gets
// invoked (see definitions/09_storage.js).
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

global.STORAGE_S3 = {};

STORAGE_S3.driver = 's3';

// The presigned URL's validity period — short enough that an accidentally
// shared/logged link doesn't stay usable for long, but long enough for a
// normal download/page load.
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
    // Backblaze B2/MinIO/most S3-compatible providers expect "path style"
    // URLs (https://endpoint/bucket/key), NOT the virtual-host style
    // (https://bucket.endpoint/key) that the AWS SDK assumes by default —
    // that's why there's a dedicated env switch for it (see docker/dev.env.example).
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
        // The local driver's delete() is also silent if the file is already
        // gone (it checks with FS.existsSync beforehand) — here it's simplest
        // to swallow a "doesn't exist" error the same way, for consistency.
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
