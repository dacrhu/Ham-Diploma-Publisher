const Fs = require('fs');

exports.install = function () {
    ROUTE('GET /admin/diplomas', view_list);
    ROUTE('GET /admin/diplomas/edit/{id}', view_edit);
    ROUTE('+GET /api/admin/diplomas *Diplomas/Diplomas --> query');
    ROUTE('+GET /api/admin/diplomas/{id} *Diplomas/Diplomas --> get');
    ROUTE('+POST /api/admin/diplomas *Diplomas/Diplomas --> save');
    ROUTE('+POST /api/admin/diplomas/delete *Diplomas/Diplomas --> delete');
    // Elrendezés-előnézet (demo adatokkal, az AKTUÁLIS — akár még el nem mentett
    // — overlayFields állapotból) — lásd Diplomas/Diplomas previewRender action.
    ROUTE('+POST /api/admin/diplomas/{id}/preview *Diplomas/Diplomas --> previewRender');
    ROUTE('+POST /upload/diplomas/{id}/blank', upload_blank, ['upload'], Number(process.env.UPLOAD_MAX_FILE_SIZE_IN_KB));
    // A NYERS (vízjel nélküli) biankó kép mostantól MANAGER-ONLY (lásd
    // serve_blank isManager-ellenőrzését) — csak az admin overlay-szerkesztőnek
    // kell, a pontos pozicionáláshoz. Korábban szándékosan auth nélküli volt "a
    // publikus előnézetnek is kelleni fog" indoklással — ez volt a hiba: a user
    // észrevette, hogy így a vízjel csak CSS-overlay, a letöltött fájlon nincs
    // rajta. A publikus/nem-manager oldalnak a vízjeles (ténylegesen legenerált)
    // verziót kell használnia, lásd serve_blank_watermarked lent.
    ROUTE('GET /uploads/diplomas/{id}/blank', serve_blank);
    ROUTE('GET /uploads/diplomas/{id}/blank-watermarked', serve_blank_watermarked);
};

function isManager(self) {
    return !!(self.user && (self.user.sa || self.user.permissions.indexOf('manager') !== -1));
}

// Egy diplomát csak a superadmin, vagy a diplomához hozzárendelt (managerId)
// manager láthat/kezelhet — lásd Diplomas/Diplomas query/get/save/delete
// actionök ugyanezen szabályát (schemas/diplomas/diplomas.js). Itt a
// controller-szintű route-oknak (nézet + kép feltöltés/kiszolgálás) kell
// ugyanez, hogy egy nem hozzárendelt manager ne is jusson el idáig ismert id
// birtokában.
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

    // Új diploma létrehozása mostantól superadmin-only — lásd Diplomas/Diplomas
    // save action ugyanezen korlátozását. Egy plain manager csak a hozzá
    // rendelt, MÁR LÉTEZŐ diplomákat szerkesztheti.
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

    // A feltöltéssel EGYÜTT rögtön legenerálunk egy ténylegesen vízjelezett
    // (Puppeteer-rel legetetett) JPEG-et is — ezt szolgálja ki majd bárkinek a
    // serve_blank_watermarked, a nyers fájlt pedig csak managernek a serve_blank.
    // Ha a renderelés hibázik, az egész feltöltést elutasítjuk (nem hagyunk
    // vízjel nélküli publikus verziót elérhetetlen állapotban) — a nyers fájlt
    // is töröljük, hogy ne maradjon árva, DB-rekord nélküli kép a storage-on.
    let watermarkedKey = `diplomas/${id}/blank-watermarked.jpg`;
    let watermarkedBuffer;

    try {
        watermarkedBuffer = await CERT_RENDERER.render(await STORAGE.read(key), key, [], {}, true);
    } catch (e) {
        FUNC.logger(self, `Diplomas/Diplomas upload blank image: vízjelezés sikertelen (${id}): ${e.message}`);
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

    FUNC.logger(self, `Diplomas/Diplomas upload blank image: ${id} (${key}, vízjelezve: ${watermarkedKey})`);
    self.json({
        success: true,
        url: `/uploads/diplomas/${id}/blank?v=${Date.now()}`,
        watermarkedUrl: `/uploads/diplomas/${id}/blank-watermarked?v=${Date.now()}`
    });
}

// Csak manager (az overlay-szerkesztőnek kell a pontos pozicionáláshoz) — lásd
// a fenti route-komment indoklását.
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

// Publikus (nincs auth-ellenőrzés) — a feltöltéskor előre legenerált, TÉNYLEGESEN
// vízjelezett JPEG-et szolgálja ki (lásd upload_blank). Ezt fogja használni az
// admin "Alapadatok" fül előnézete is, és majd az 5. lépés publikus oldala.
async function serve_blank_watermarked(id) {
    let self = this;
    let diploma = await MDB.findOne(process.env.MONGODB_DB_NAME, 'diplomas', { _id: MDB.ObjectID(id) }, { projection: { blankImage: 1 } });

    if (!diploma || !diploma.blankImage || !diploma.blankImage.watermarkedKey || !(await STORAGE.exists(diploma.blankImage.watermarkedKey))) {
        self.throw404();
        return;
    }

    await STORAGE.serve(self, diploma.blankImage.watermarkedKey);
}
