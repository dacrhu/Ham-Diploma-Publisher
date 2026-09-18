const form_settings = document.getElementById('form_settings');
const button_settings = document.getElementById('button_settings');
const notification_success = document.getElementById('notification_success');
const select_mfa_policy_user = document.getElementById('select_mfa_policy_user');
const select_mfa_policy_manager = document.getElementById('select_mfa_policy_manager');
const input_site_title = document.getElementById('input_site_title');
const textarea_site_welcometext = document.getElementById('textarea_site_welcometext');
const textarea_contacts_html = document.getElementById('textarea_contacts_html');
const select_default_language = document.getElementById('select_default_language');

async function loadSettings() {
	let response = await fetch('/api/admin/settings');
	let json = await response.json();

	if (!json.success) {
		return;
	}

	select_mfa_policy_user.value = json.data.mfaPolicyUser;
	select_mfa_policy_manager.value = json.data.mfaPolicyManager;
	input_site_title.value = json.data.siteTitle || '';
	textarea_site_welcometext.value = json.data.siteWelcomeText || '';
	textarea_contacts_html.value = json.data.contactsHtml || '';
	select_default_language.value = json.data.defaultLanguage || 'hu';

	let methods = json.data.mfaMethodsAllowed || [];
	let checkboxes = document.querySelectorAll('input[name="mfaMethodsAllowed"]');
	for (let i = 0, n = checkboxes.length; i < n; i++) {
		checkboxes[i].checked = methods.indexOf(checkboxes[i].value) !== -1;
	}

	if (json.data.siteLogo) {
		setLogoPreview('/uploads/site/logo?v=' + Date.now());
	}

	if (json.data.siteBanner) {
		setBannerPreview('/uploads/site/banner?v=' + Date.now());
	}
}

loadSettings();

feEventId(form_settings, 'onsubmit', async function (e) {
	e.preventDefault();

	notification_success.classList.add('is-hidden');
	button_settings.classList.add('is-loading');
	button_settings.disabled = true;

	try {
		let body = {
			mfaPolicyUser: select_mfa_policy_user.value,
			mfaPolicyManager: select_mfa_policy_manager.value,
			mfaMethodsAllowed: feGetCheckboxValues('mfaMethodsAllowed'),
			siteTitle: input_site_title.value,
			siteWelcomeText: textarea_site_welcometext.value,
			contactsHtml: textarea_contacts_html.value,
			defaultLanguage: select_default_language.value
		};

		let response = await fetch('/api/admin/settings', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		let json = await response.json();

		if (json.success) {
			notification_success.classList.remove('is-hidden');
		}
	} catch (err) {
		// no-op
	}

	button_settings.classList.remove('is-loading');
	button_settings.disabled = false;
});
