function startMfaVerify(token, method) {
	showPanel(panel_mfa_verify);
	form_mfa_verify.dataset.token = token;
	mfa_verify_intro.textContent = mfa_verify_intro.dataset[method] || '';
}

function startMfaSetup(token, methods) {
	showPanel(panel_mfa_setup_choose);
	panel_mfa_setup_choose.dataset.token = token;

	let hasEmail = methods && methods.indexOf('email') !== -1;
	let hasTotp = methods && methods.indexOf('totp') !== -1;

	button_mfa_method_email.classList.toggle('is-hidden', !hasEmail);
	button_mfa_method_totp.classList.toggle('is-hidden', !hasTotp);
}

feEventId(button_mfa_method_email, 'onclick', function () {
	selectMfaMethod('email');
});

feEventId(button_mfa_method_totp, 'onclick', function () {
	selectMfaMethod('totp');
});

async function selectMfaMethod(method) {
	let token = panel_mfa_setup_choose.dataset.token;

	button_mfa_method_email.classList.add('is-loading');
	button_mfa_method_totp.classList.add('is-loading');

	try {
		let response = await fetch('/api/mfa/setup-select', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token: token, method: method })
		});
		let json = await response.json();

		button_mfa_method_email.classList.remove('is-loading');
		button_mfa_method_totp.classList.remove('is-loading');

		if (!json.success) {
			return;
		}

		form_mfa_setup_confirm.dataset.token = token;

		if (json.method === 'email') {
			mfa_setup_email_block.classList.remove('is-hidden');
			mfa_setup_totp_block.classList.add('is-hidden');
		} else {
			mfa_setup_totp_block.classList.remove('is-hidden');
			mfa_setup_email_block.classList.add('is-hidden');
			mfa_totp_qr.src = json.qr;
			mfa_totp_secret.value = json.secret;
		}

		showPanel(panel_mfa_setup_confirm);
	} catch (err) {
		button_mfa_method_email.classList.remove('is-loading');
		button_mfa_method_totp.classList.remove('is-loading');
	}
}

feEventId(form_mfa_verify, 'onsubmit', async function (e) {
	e.preventDefault();

	notification_mfa_verify_error.classList.add('is-hidden');
	button_mfa_verify.classList.add('is-loading');
	button_mfa_verify.disabled = true;

	try {
		let body = feFormToJSON('form_mfa_verify');
		body.token = form_mfa_verify.dataset.token;

		let response = await fetch('/api/mfa/verify', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		let json = await response.json();

		if (json.success && json.next === 'main') {
			window.location.href = '/account';
			return;
		}

		notification_mfa_verify_error.textContent = json.message || '';
		notification_mfa_verify_error.classList.remove('is-hidden');
	} catch (err) {
		notification_mfa_verify_error.classList.remove('is-hidden');
	}

	button_mfa_verify.classList.remove('is-loading');
	button_mfa_verify.disabled = false;
});

feEventId(form_mfa_setup_confirm, 'onsubmit', async function (e) {
	e.preventDefault();

	notification_mfa_setup_error.classList.add('is-hidden');
	button_mfa_setup_confirm.classList.add('is-loading');
	button_mfa_setup_confirm.disabled = true;

	try {
		let body = feFormToJSON('form_mfa_setup_confirm');
		body.token = form_mfa_setup_confirm.dataset.token;

		let response = await fetch('/api/mfa/setup-confirm', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		let json = await response.json();

		if (json.success && json.next === 'main') {
			window.location.href = '/account';
			return;
		}

		notification_mfa_setup_error.textContent = json.message || '';
		notification_mfa_setup_error.classList.remove('is-hidden');
	} catch (err) {
		notification_mfa_setup_error.classList.remove('is-hidden');
	}

	button_mfa_setup_confirm.classList.remove('is-loading');
	button_mfa_setup_confirm.disabled = false;
});
