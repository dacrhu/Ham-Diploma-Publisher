// Settings/Settings — a globális `settings` szinguláris dokumentum (_id: 'global')
// admin felületi kezelése. Csak manager (vagy sa) érheti el. A tényleges olvasás
// belső célra (pl. login action MFA-ellenőrzés) a modules/settings-store.js-en
// (`SETTINGS.get()`) keresztül történik, permission-ellenőrzés nélkül.
const MFA_POLICIES = ['disabled', 'optional', 'required'];
const MFA_METHODS = ['email', 'totp'];
const SUPPORTED_LANGUAGES = ['hu', 'en', 'de'];

NEWSCHEMA('Settings/Settings', function (schema) {

    schema.action('get', {
        permissions: ['manager'],
        action: async function ($) {
            $.callback({ success: true, data: await SETTINGS.get() });
        }
    });

    schema.action('save', {
        permissions: ['manager'],
        language: true,
        action: async function ($) {
            let model = $.model || {};

            if (MFA_POLICIES.indexOf(model.mfaPolicyUser) === -1 || MFA_POLICIES.indexOf(model.mfaPolicyManager) === -1) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            if (SUPPORTED_LANGUAGES.indexOf(model.defaultLanguage) === -1) {
                $.callback({ success: false, message: RESOURCE($.language, 'error.internal') });
                return;
            }

            let methods = Array.isArray(model.mfaMethodsAllowed) ? model.mfaMethodsAllowed.filter(m => MFA_METHODS.indexOf(m) !== -1) : [];

            let set = {
                mfaPolicyUser: model.mfaPolicyUser,
                mfaPolicyManager: model.mfaPolicyManager,
                mfaMethodsAllowed: methods,
                siteTitle: (model.siteTitle || '').trim(),
                siteWelcomeText: (model.siteWelcomeText || '').trim(),
                contactsHtml: (model.contactsHtml || '').trim(),
                defaultLanguage: model.defaultLanguage,
                updated: new Date(),
                updatedBy: $.user._id
            };

            await MDB.updateOne(process.env.MONGODB_DB_NAME, 'settings', { _id: 'global' }, set, true);
            await SETTINGS.invalidate();

            FUNC.logger($, `Settings/Settings save: ${JSON.stringify(set)}`);
            $.callback({ success: true });
        }
    });
});
