// Selects the active driver based on the `STORAGE_DRIVER` env var (local|s3),
// and exposes it uniformly as `global.STORAGE` — both drivers
// (modules/storage-local.js, modules/storage-s3.js) implement the same API
// (save/read/exists/delete/serve), the calling code doesn't know/need to know
// which one is selected. The S3 driver module is ALWAYS loaded (every file in
// the `modules/` folder runs automatically), but instantiating the `S3Client`
// by itself makes no network call — completely harmless during local
// ("local") development even if no real S3 keys are configured.
if (process.env.STORAGE_DRIVER !== 'local' && process.env.STORAGE_DRIVER !== 's3') {
    throw new Error(`Ismeretlen STORAGE_DRIVER: "${process.env.STORAGE_DRIVER}" — csak "local" vagy "s3" lehet.`);
}

global.STORAGE = process.env.STORAGE_DRIVER === 's3' ? STORAGE_S3 : STORAGE_LOCAL;
