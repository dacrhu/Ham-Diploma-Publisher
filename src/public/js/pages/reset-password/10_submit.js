feEventId(form_reset, 'onsubmit', async function (e) {
	e.preventDefault();

	notification_error.classList.add('is-hidden');
	button_reset.classList.add('is-loading');
	button_reset.disabled = true;

	try {
		let body = feFormToJSON('form_reset');
		let response = await fetch('/api/reset-password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		let json = await response.json();

		if (json.success) {
			form_reset.classList.add('is-hidden');
			notification_success.classList.remove('is-hidden');
		} else {
			notification_error.textContent = json.message || '';
			notification_error.classList.remove('is-hidden');
			button_reset.classList.remove('is-loading');
			button_reset.disabled = false;
		}
	} catch (err) {
		notification_error.classList.remove('is-hidden');
		button_reset.classList.remove('is-loading');
		button_reset.disabled = false;
	}
});
