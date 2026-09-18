const panel_mfa_status = document.getElementById('panel_mfa_status');
const panel_mfa_confirm = document.getElementById('panel_mfa_confirm');
const notification_mfa_status = document.getElementById('notification_mfa_status');
const button_mfa_disable = document.getElementById('button_mfa_disable');

const mfa_setup_email_block = document.getElementById('mfa_setup_email_block');
const mfa_setup_totp_block = document.getElementById('mfa_setup_totp_block');
const mfa_totp_qr = document.getElementById('mfa_totp_qr');
const mfa_totp_secret = document.getElementById('mfa_totp_secret');
const form_mfa_confirm = document.getElementById('form_mfa_confirm');
const button_mfa_confirm = document.getElementById('button_mfa_confirm');
const button_mfa_cancel = document.getElementById('button_mfa_cancel');
const notification_mfa_error = document.getElementById('notification_mfa_error');

function showMfaNotification(text, isError) {
	notification_mfa_status.textContent = text;
	notification_mfa_status.classList.remove('is-hidden', 'is-success', 'is-danger');
	notification_mfa_status.classList.add(isError ? 'is-danger' : 'is-success');
}

feEventClass('mfa-method-btn', 'onclick', async function () {
	let method = this.dataset.method;
	let buttons = document.getElementsByClassName('mfa-method-btn');
	for (let i = 0, n = buttons.length; i < n; i++) {
		buttons[i].classList.add('is-loading');
		buttons[i].disabled = true;
	}

	try {
		let response = await fetch('/api/account/mfa/start', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ method: method })
		});
		let json = await response.json();

		for (let i = 0, n = buttons.length; i < n; i++) {
			buttons[i].classList.remove('is-loading');
			buttons[i].disabled = false;
		}

		if (!json.success) {
			return;
		}

		form_mfa_confirm.dataset.token = json.token;

		if (json.method === 'email') {
			mfa_setup_email_block.classList.remove('is-hidden');
			mfa_setup_totp_block.classList.add('is-hidden');
		} else {
			mfa_setup_totp_block.classList.remove('is-hidden');
			mfa_setup_email_block.classList.add('is-hidden');
			mfa_totp_qr.src = json.qr;
			mfa_totp_secret.value = json.secret;
		}

		panel_mfa_status.classList.add('is-hidden');
		panel_mfa_confirm.classList.remove('is-hidden');
	} catch (err) {
		for (let i = 0, n = buttons.length; i < n; i++) {
			buttons[i].classList.remove('is-loading');
			buttons[i].disabled = false;
		}
	}
});

feEventId(button_mfa_cancel, 'onclick', function () {
	panel_mfa_confirm.classList.add('is-hidden');
	panel_mfa_status.classList.remove('is-hidden');
	form_mfa_confirm.reset();
});

feEventId(form_mfa_confirm, 'onsubmit', async function (e) {
	e.preventDefault();

	notification_mfa_error.classList.add('is-hidden');
	button_mfa_confirm.classList.add('is-loading');
	button_mfa_confirm.disabled = true;

	try {
		let body = feFormToJSON('form_mfa_confirm');
		body.token = form_mfa_confirm.dataset.token;

		let response = await fetch('/api/account/mfa/confirm', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		let json = await response.json();

		if (json.success) {
			showMfaNotification(notification_mfa_status.dataset.saved, false);
			setTimeout(() => window.location.reload(), 800);
			return;
		}

		notification_mfa_error.textContent = json.message || '';
		notification_mfa_error.classList.remove('is-hidden');
	} catch (err) {
		notification_mfa_error.classList.remove('is-hidden');
	}

	button_mfa_confirm.classList.remove('is-loading');
	button_mfa_confirm.disabled = false;
});

if (button_mfa_disable) {
	feEventId(button_mfa_disable, 'onclick', async function () {
		button_mfa_disable.classList.add('is-loading');
		button_mfa_disable.disabled = true;

		try {
			let response = await fetch('/api/account/mfa/disable', { method: 'POST' });
			let json = await response.json();

			if (json.success) {
				window.location.reload();
				return;
			}

			showMfaNotification(json.message || '', true);
		} catch (err) {
			// no-op
		}

		button_mfa_disable.classList.remove('is-loading');
		button_mfa_disable.disabled = false;
	});
}
