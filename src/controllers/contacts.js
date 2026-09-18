// Public "Contacts" page (at user request) — the manager/sa
// fills in its content as free text (accepting RAW HTML too) on the
// /admin/settings page (see schemas/settings/settings.js,
// modules/settings-store.js SETTINGS.DEFAULTS.contactsHtml comment on the
// trust/XSS considerations), here we just display it.
exports.install = function () {
    ROUTE('GET /contacts', view_contacts);
};

async function view_contacts() {
    let self = this;
    let settings = await SETTINGS.get();

    self.repository.contactsHtml = (settings.contactsHtml || '').trim();
    self.view('contacts');
}
