const Fs = require('fs');

exports.install = function () {
    ROUTE('GET /admin/diplomas', view_list);
    ROUTE('GET /admin/diplomas/edit/{id}', view_edit);
    ROUTE('+GET /api/admin/diplomas *Diplomas/Diplomas --> query');
    ROUTE('+GET /api/admin/diplomas/{id} *Diplomas/Diplomas --> get');
    ROUTE('+POST /api/admin/diplomas *Diplomas/Diplomas --> save');
    ROUTE('+POST /api/admin/diplomas/delete *Diplomas/Diplomas --> delete');
    // Layout preview (with demo data, from the CURRENT — possibly not yet saved
    // — overlayFields state) — see the Diplomas/Diplomas previewRender action.
    ROUTE('+POST /api/admin/diplomas/{id}/preview *Diplomas/Diplomas --> previewRender');
    ROUTE('+POST /upload/diplomas/{id}/blank', upload_blank, ['upload'], Number(process.env.UPLOAD_MAX_FILE_SIZE_IN_KB));
    // The RAW (unwatermarked) blank image is now MANAGER-ONLY (see
    // serve_blank's isManager check) — only the admin overlay editor needs it,
    // for precise positioning. It used to be intentionally without auth, with
    // the reasoning "the public preview will need it too" — that was the bug:
    // the user noticed that this way the watermark was only a CSS overlay, not
    // actually present on the downloaded file. The public/non-manager side must
    // use the watermarked (actually generated) version, see serve_blank_watermarked below.
    ROUTE('GET /uploads/diplomas/{id}/blank', serve_blank);
    ROUTE('GET /uploads/diplomas/{id}/blank-watermarked', serve_blank_watermarked);
};

function isManager(self) {
    return !!(self.user && (self.user.sa || self.user.permissions.indexOf('manager') !== -1));
}

// A diploma can only be seen/managed by the superadmin, or by the manager
// assigned to it (managerId) — see the same rule in the Diplomas/Diplomas
// query/get/save/delete actions (schemas/diplomas/diplomas.js). Here the
// controller-level routes (view + image upload/serving) need the same, so
// that an unassigned manager can't get this far even knowing the id.
async function canAccessDiploma(self, id) {
    if (self.user && self.user.sa)
        return true;

    let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(id) }, { projection: { managerId: 1 } });
    return !!(diploma && diploma.managerId && self.user && diploma.managerId === self.user._id);
}

function view_list() {
    let self = this;

    if (!isManager(self)) {
        self.redirect('/');
        return;
    }

    self.view('list');
}

async function view_edit(id) {
    let self = this;

    if (!isManager(self)) {
        self.redirect('/');
        return;
    }

    // Creating a new diploma is now superadmin-only — see the same restriction
    // on the Diplomas/Diplomas save action. A plain manager can only edit the
    // ALREADY EXISTING diplomas assigned to them.
    if (id === 'new') {
        if (!self.user.sa) {
            self.redirect('/admin/diplomas');
            return;
        }
    } else if (!(await canAccessDiploma(self, id))) {
        self.redirect('/admin/diplomas');
        return;
    }

    self.repository.id = id;
    self.repository.countries = COUNTRIES.list(self.language);
    self.view('edit');
}

async function upload_blank(id) {
    let self = this;

    if (!isManager(self)) {
        self.throw401();
        return;
    }

    if (!(await canAccessDiploma(self, id))) {
        self.throw403();
        return;
    }

    if (!self.files || !self.files.length) {
        self.json({ success: false });
        return;
    }

    let file = self.files[0];
    let ext = (file.filename.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    let key = `diplomas/${id}/blank.${ext}`;
    let buffer = Fs.readFileSync(file.path);

    await STORAGE.save(key, buffer);

    // TOGETHER with the upload, we immediately generate an actually watermarked
    // (Puppeteer-rendered) JPEG as well — this is what serve_blank_watermarked
    // will serve to anyone, while the raw file is served only to a manager, via
    // serve_blank. If the rendering fails, we reject the whole upload (so we
    // don't leave an unwatermarked public version in an unreachable state) — we
    // also delete the raw file, so no orphaned, DB-record-less image is left in storage.
    let watermarkedKey = `diplomas/${id}/blank-watermarked.jpg`;
    let watermarkedBuffer;

    try {
        watermarkedBuffer = await CERT_RENDERER.render(await STORAGE.read(key), key, [], {}, true);
    } catch (e) {
        FUNC.logger(self, `Diplomas/Diplomas upload blank image: watermarking failed (${id}): ${e.message}`);
        await STORAGE.delete(key);
        self.json({ success: false, message: RESOURCE(self.language, 'error.diploma.blank.watermark') });
        return;
    }

    await STORAGE.save(watermarkedKey, watermarkedBuffer);

    let update = await MDB.updateOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(id) }, {
        blankImage: { filename: `blank.${ext}`, storage: STORAGE.driver, key: key, watermarkedKey: watermarkedKey },
        updated: new Date()
    });

    if (Array.isArray(update) && update[0] && update[0].error) {
        self.json({ success: false });
        return;
    }

    FUNC.logger(self, `Diplomas/Diplomas upload blank image: ${id} (${key}, watermarked: ${watermarkedKey})`);
    self.json({
        success: true,
        url: `/uploads/diplomas/${id}/blank?v=${Date.now()}`,
        watermarkedUrl: `/uploads/diplomas/${id}/blank-watermarked?v=${Date.now()}`
    });
}

// Manager only (needed by the overlay editor for precise positioning) — see
// the route comment's reasoning above.
async function serve_blank(id) {
    let self = this;

    if (!isManager(self)) {
        self.throw401();
        return;
    }

    let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(id) }, { projection: { blankImage: 1, managerId: 1 } });

    if (!diploma) {
        self.throw404();
        return;
    }

    if (!self.user.sa && diploma.managerId !== self.user._id) {
        self.throw403();
        return;
    }

    if (!diploma.blankImage || !diploma.blankImage.key || !(await STORAGE.exists(diploma.blankImage.key))) {
        self.throw404();
        return;
    }

    await STORAGE.serve(self, diploma.blankImage.key);
}

// Public (no auth check) — serves the ACTUALLY watermarked JPEG pre-generated
// at upload time (see upload_blank). This will also be used by the admin
// "Basic data" tab's preview, and later by step 5's public page.
async function serve_blank_watermarked(id) {
    let self = this;
    let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(id) }, { projection: { blankImage: 1 } });

    if (!diploma || !diploma.blankImage || !diploma.blankImage.watermarkedKey || !(await STORAGE.exists(diploma.blankImage.watermarkedKey))) {
        self.throw404();
        return;
    }

    await STORAGE.serve(self, diploma.blankImage.watermarkedKey);
}
