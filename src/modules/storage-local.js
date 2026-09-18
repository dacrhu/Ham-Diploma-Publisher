// storage-local.js — lokális fájlrendszer storage driver (src/private/uploads/...).
// A `STORAGE` globál egységes API-ját valósítja meg (lásd definitions/09_storage.js) —
// ugyanezt az API-t valósítja meg a storage-s3.js is (11. lépés), így a
// feltöltési/kiszolgálási útvonalak kódja nem tudja/nem is kell tudnia, melyik
// driver aktív. Az EGYSÉGES, driver-független API: `save`, `read`, `exists`
// (mindhárom async, még ha a helyi driver szinkron is tudná), `delete`,
// `serve(controllerSelf, key, downloadName)` — a `filePath()` SZÁNDÉKOSAN NEM
// része a driver-független szerződésnek (S3-nál nincs "helyi elérési út"),
// csak ennek a fájlnak a belső segédfüggvénye.
const FS = require('fs');
const PATHMOD = require('path');

global.STORAGE_LOCAL = {};

STORAGE_LOCAL.driver = 'local';

function filePath(key) {
    return PATH.private('uploads/' + key);
}

// key: pl. "diplomas/{id}/blank.jpg" — a src/private/uploads/ alá kerül.
STORAGE_LOCAL.save = async function (key, buffer) {
    let fullPath = filePath(key);
    let dir = PATHMOD.dirname(fullPath);

    if (!FS.existsSync(dir))
        FS.mkdirSync(dir, { recursive: true });

    FS.writeFileSync(fullPath, buffer);
    return { storage: 'local', key: key };
};

STORAGE_LOCAL.read = async function (key) {
    return FS.readFileSync(filePath(key));
};

STORAGE_LOCAL.exists = async function (key) {
    return FS.existsSync(filePath(key));
};

STORAGE_LOCAL.delete = async function (key) {
    let fullPath = filePath(key);
    if (FS.existsSync(fullPath))
        FS.unlinkSync(fullPath);
};

// HTTP-válaszba kiszolgálás — a Total.js `self.file()`-ja natívan a lemezről
// streamel, ezért itt egyszerűen delegálunk rá. `downloadName` opcionális
// (`Content-Disposition` fájlnév, lásd controllers/submissions.js
// serve_diploma_pdf).
STORAGE_LOCAL.serve = async function (self, key, downloadName) {
    self.file('~' + filePath(key), downloadName);
};
