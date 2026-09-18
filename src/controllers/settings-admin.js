const Fs = require('fs');

exports.install = function () {
    ROUTE('GET /admin/settings', view_settings);
    ROUTE('+GET /api/admin/settings *Settings/Settings --> get');
    ROUTE('+POST /api/admin/settings *Settings/Settings --> save');
    // Diploma-manager szerepkör kiosztása/visszavonása — lásd Users/Users
    // query/setManager actionök (sa-only ellenőrzés az actionön belül, nem itt).
    ROUTE('+GET /api/admin/users *Users/Users --> query');
    ROUTE('+POST /api/admin/users/set-manager *Users/Users --> setManager');
    // Főoldal-logó (oldalsáv teteje, MINDEN oldalon) + banner (csak a
    // főoldalon, a logó korábbi helyén, felhasználói kérésre külön kép)
    // feltöltése/kiszolgálása — ugyanaz a minta, mint a diploma biankó képnél
    // (lásd controllers/diplomas-admin.js upload_blank/serve_blank), csak
    // nincs vízjelezés és nincs id-paraméter (a `settings` szinguláris). A
    // kiszolgálás szándékosan PUBLIKUS (nincs auth-ellenőrzés) — mindkettőt
    // be nem jelentkezett látogató is látja.
    ROUTE('+POST /upload/site/logo', upload_logo, ['upload'], Number(process.env.UPLOAD_MAX_FILE_SIZE_IN_KB));
    ROUTE('GET /uploads/site/logo', serve_logo);
    ROUTE('+POST /upload/site/banner', upload_banner, ['upload'], Number(process.env.UPLOAD_MAX_FILE_SIZE_IN_KB));
    ROUTE('GET /uploads/site/banner', serve_banner);
};

function isManager(self) {
    return !!(self.user && (self.user.sa || self.user.permissions.indexOf('manager') !== -1));
}

function view_settings() {
    let self = this;

    if (!self.user || (!self.user.sa && self.user.permissions.indexOf('manager') === -1)) {
        self.redirect('/');
        return;
    }

    self.view('settings-admin');
}

// `field`: a `settings` dokumentum mezőneve ('siteLogo'/'siteBanner'), `slug`:
// a storage-kulcs/fájlnév-előtag ('logo'/'banner') — a logó és a banner
// feltöltése/tárolása/takarítása egyébként teljesen azonos logikát követ,
// ezért ez a két apró route-függvény (upload_logo/upload_banner) csak erre a
// közös segédre hivatkozik.
async function uploadSiteImage(self, field, slug) {
    if (!isManager(self)) {
        self.throw401();
        return;
    }

    if (!self.files || !self.files.length) {
        self.json({ success: false });
        return;
    }

    let file = self.files[0];
    let ext = (file.filename.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    let key = `site/${slug}.${ext}`;
    let buffer = Fs.readFileSync(file.path);

    await STORAGE.save(key, buffer);

    let settings = await SETTINGS.get();
    let previous = settings[field];

    // Ha korábban más kiterjesztéssel volt kép (pl. .png helyett most .jpg), a
    // régi fájlt töröljük, hogy ne maradjon árva, DB-hivatkozás nélküli kép.
    if (previous && previous.key && previous.key !== key) {
        await STORAGE.delete(previous.key);
    }

    let set = {};
    set[field] = { filename: `${slug}.${ext}`, storage: STORAGE.driver, key: key };
    set.updated = new Date();
    set.updatedBy = self.user._id;

    let update = await MDB.updateOne(process.env.MONGODB_DB_NAME, 'settings', { _id: 'global' }, set, true);

    if (Array.isArray(update) && update[0] && update[0].error) {
        self.json({ success: false });
        return;
    }

    await SETTINGS.invalidate();

    FUNC.logger(self, `Settings/Settings upload ${slug}: ${key}`);
    self.json({ success: true, url: `/uploads/site/${slug}?v=${Date.now()}` });
}

async function serveSiteImage(self, field) {
    let settings = await SETTINGS.get();
    let image = settings[field];

    if (!image || !image.key || !(await STORAGE.exists(image.key))) {
        self.throw404();
        return;
    }

    await STORAGE.serve(self, image.key);
}

async function upload_logo() {
    return uploadSiteImage(this, 'siteLogo', 'logo');
}

async function serve_logo() {
    return serveSiteImage(this, 'siteLogo');
}

async function upload_banner() {
    return uploadSiteImage(this, 'siteBanner', 'banner');
}

async function serve_banner() {
    return serveSiteImage(this, 'siteBanner');
}
