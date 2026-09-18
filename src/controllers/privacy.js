// Public "Privacy policy" page — same pattern as
// controllers/contacts.js: the manager/sa fills in its content as free text
// (accepting RAW HTML too) on the /admin/settings page (see
// schemas/settings/settings.js, modules/settings-store.js
// SETTINGS.DEFAULTS.privacyPolicyHtml), here we just display it.
exports.install = function () {
    ROUTE('GET /privacy', view_privacy);
};

async function view_privacy() {
    let self = this;
    let settings = await SETTINGS.get();

    self.repository.privacyPolicyHtml = (settings.privacyPolicyHtml || '').trim();
    self.view('privacy');
}
