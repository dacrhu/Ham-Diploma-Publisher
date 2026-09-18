feEventId(form_account, 'onsubmit', async function (e) {
	e.preventDefault();

	notification_error.classList.add('is-hidden');
	notification_success.classList.add('is-hidden');

	let body = feFormToJSON('form_account');

	if (body.password && !fePasswordValid(body.password)) {
		notification_error.classList.remove('is-hidden');
		return;
	}

	if (body.password && body.password !== body.passwordConfirm) {
		notification_error.classList.remove('is-hidden');
		return;
	}

	button_account.classList.add('is-loading');
	button_account.disabled = true;

	try {
		let response = await fetch('/api/account', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		let json = await response.json();

		if (json.success) {
			notification_success.classList.remove('is-hidden');
			input_password.value = '';
			form_account.passwordConfirm.value = '';
			setTimeout(() => window.location.reload(), 800);
		} else {
			notification_error.textContent = json.message || '';
			notification_error.classList.remove('is-hidden');
			button_account.classList.remove('is-loading');
			button_account.disabled = false;
		}
	} catch (err) {
		notification_error.classList.remove('is-hidden');
		button_account.classList.remove('is-loading');
		button_account.disabled = false;
	}
});
