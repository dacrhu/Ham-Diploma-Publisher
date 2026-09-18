// Publikus "Kapcsolatok" oldal (felhasználói kérésre) — a manager/sa
// szabadszövegesen (NYERS HTML-t is elfogadva) tölti fel a tartalmát a
// /admin/settings oldalon (lásd schemas/settings/settings.js,
// modules/settings-store.js SETTINGS.DEFAULTS.contactsHtml kommentje a
// bizalmi/XSS-megfontolásról), itt csak megjelenítjük.
exports.install = function () {
    ROUTE('GET /contacts', view_contacts);
};

async function view_contacts() {
    let self = this;
    let settings = await SETTINGS.get();

    self.repository.contactsHtml = (settings.contactsHtml || '').trim();
    self.view('contacts');
}
