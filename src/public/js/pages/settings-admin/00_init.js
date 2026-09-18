const form_settings = document.getElementById('form_settings');
const button_settings = document.getElementById('button_settings');
const notification_success = document.getElementById('notification_success');
const select_mfa_policy_user = document.getElementById('select_mfa_policy_user');
const select_mfa_policy_manager = document.getElementById('select_mfa_policy_manager');
const input_site_title = document.getElementById('input_site_title');
const textarea_site_welcometext = document.getElementById('textarea_site_welcometext');
const textarea_contacts_html = document.getElementById('textarea_contacts_html');
const textarea_privacy_html = document.getElementById('textarea_privacy_html');
const select_default_language = document.getElementById('select_default_language');

// --- Tab switching (see pages/diplomas-admin-edit/00_init.js, same pattern) ---
feEventClass('tab', 'onclick', function () {
	let tabs = document.querySelectorAll('.tabs .tab');
	for (let i = 0, n = tabs.length; i < n; i++) {
		tabs[i].classList.remove('is-active');
	}
	this.classList.add('is-active');

	let panels = ['tab_general', 'tab_contact', 'tab_privacy', 'tab_qsl', 'tab_security'];
	for (let i = 0, n = panels.length; i < n; i++) {
		document.getElementById(panels[i]).classList.toggle('is-hidden', panels[i] !== this.dataset.id);
	}
});

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
	textarea_privacy_html.value = json.data.privacyPolicyHtml || '';
	select_default_language.value = json.data.defaultLanguage || 'hu';

	let methods = json.data.mfaMethodsAllowed || [];
	let checkboxes = document.querySelectorAll('input[name="mfaMethodsAllowed"]');
	for (let i = 0, n = checkboxes.length; i < n; i++) {
		checkboxes[i].checked = methods.indexOf(checkboxes[i].value) !== -1;
	}

	let qslTypes = json.data.qslTypesAllowed || [];
	let qslCheckboxes = document.querySelectorAll('input[name="qslTypesAllowed"]');
	for (let i = 0, n = qslCheckboxes.length; i < n; i++) {
		qslCheckboxes[i].checked = qslTypes.indexOf(qslCheckboxes[i].value) !== -1;
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
			privacyPolicyHtml: textarea_privacy_html.value,
			qslTypesAllowed: feGetCheckboxValues('qslTypesAllowed'),
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
