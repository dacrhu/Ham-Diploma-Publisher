feEventId(form_login, 'onsubmit', async function (e) {
	e.preventDefault();

	notification_error.classList.add('is-hidden');
	button_login.classList.add('is-loading');
	button_login.disabled = true;

	try {
		let body = feFormToJSON('form_login');
		let response = await fetch('/api/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		let json = await response.json();

		if (!json.success) {
			notification_error.textContent = json.message || '';
			notification_error.classList.remove('is-hidden');
			button_login.classList.remove('is-loading');
			button_login.disabled = false;
			return;
		}

		if (json.next === 'main') {
			window.location.href = '/account';
		} else if (json.next === 'mfa_verify') {
			startMfaVerify(json.token, json.method);
			button_login.classList.remove('is-loading');
			button_login.disabled = false;
		} else if (json.next === 'mfa_setup') {
			startMfaSetup(json.token, json.methods);
			button_login.classList.remove('is-loading');
			button_login.disabled = false;
		}
	} catch (err) {
		notification_error.classList.remove('is-hidden');
		button_login.classList.remove('is-loading');
		button_login.disabled = false;
	}
});
