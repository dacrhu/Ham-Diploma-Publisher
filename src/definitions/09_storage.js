// A `STORAGE_DRIVER` env változó (local|s3) alapján választja ki az aktív
// driver-t, és `global.STORAGE` néven teszi elérhetővé egységesen — mindkét
// driver (modules/storage-local.js, modules/storage-s3.js) ugyanazt az API-t
// valósítja meg (save/read/exists/delete/serve), a hívó kód nem tudja/nem is
// kell tudnia, melyik van kiválasztva. Az S3-driver modulja MINDIG betöltődik
// (a `modules/` mappa minden fájlja automatikusan fut), de az `S3Client`
// példányosítása önmagában nem csinál hálózati hívást — helyi ("local")
// fejlesztéskor teljesen ártalmatlan, ha épp nincsenek is valódi S3-kulcsok
// beállítva.
if (process.env.STORAGE_DRIVER !== 'local' && process.env.STORAGE_DRIVER !== 's3') {
    throw new Error(`Ismeretlen STORAGE_DRIVER: "${process.env.STORAGE_DRIVER}" — csak "local" vagy "s3" lehet.`);
}

global.STORAGE = process.env.STORAGE_DRIVER === 's3' ? STORAGE_S3 : STORAGE_LOCAL;
