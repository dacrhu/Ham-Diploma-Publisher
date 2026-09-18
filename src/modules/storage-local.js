// storage-local.js — local filesystem storage driver (src/private/uploads/...).
// Implements the `STORAGE` global's unified API (see definitions/09_storage.js) —
// storage-s3.js (step 11) implements the same API too, so the upload/serving
// route code doesn't know/need to know which driver is active. The UNIFIED,
// driver-independent API: `save`, `read`, `exists` (all three async, even
// though the local driver could do it synchronously), `delete`,
// `serve(controllerSelf, key, downloadName)` — `filePath()` is DELIBERATELY NOT
// part of the driver-independent contract (S3 has no "local path"), it's just
// an internal helper function of this file.
const FS = require('fs');
const PATHMOD = require('path');

global.STORAGE_LOCAL = {};

STORAGE_LOCAL.driver = 'local';

function filePath(key) {
    return PATH.private('uploads/' + key);
}

// key: e.g. "diplomas/{id}/blank.jpg" — goes under src/private/uploads/.
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

// Serving into the HTTP response — Total.js's `self.file()` natively streams
// from disk, so here we simply delegate to it. `downloadName` is optional
// (`Content-Disposition` filename, see controllers/submissions.js
// serve_diploma_pdf).
STORAGE_LOCAL.serve = async function (self, key, downloadName) {
    self.file('~' + filePath(key), downloadName);
};
