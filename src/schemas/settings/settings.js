// Settings/Settings — admin UI management of the global `settings` singleton document
// (_id: 'global'). Only accessible by manager (or sa). Actual reads for internal
// purposes (e.g. login action's MFA check) go through modules/settings-store.js
// (`SETTINGS.get()`), without a permission check.
const MFA_POLICIES = ['disabled', 'optional', 'required'];
const MFA_METHODS = ['email', 'totp'];
const SUPPORTED_LANGUAGES = ['hu', 'en', 'de'];
const QSL_TYPES = ['lotw', 'eqsl', 'qrz', 'clublog', 'hrdlog', 'email', 'paper'];

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
            let qslTypes = Array.isArray(model.qslTypesAllowed) ? model.qslTypesAllowed.filter(t => QSL_TYPES.indexOf(t) !== -1) : [];

            let set = {
                mfaPolicyUser: model.mfaPolicyUser,
                mfaPolicyManager: model.mfaPolicyManager,
                mfaMethodsAllowed: methods,
                siteTitle: (model.siteTitle || '').trim(),
                siteWelcomeText: (model.siteWelcomeText || '').trim(),
                contactsHtml: (model.contactsHtml || '').trim(),
                privacyPolicyHtml: (model.privacyPolicyHtml || '').trim(),
                qslTypesAllowed: qslTypes,
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
