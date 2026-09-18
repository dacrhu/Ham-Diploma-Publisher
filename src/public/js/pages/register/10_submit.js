feEventId(form_register, 'onsubmit', async function (e) {
	e.preventDefault();

	notification_error.classList.add('is-hidden');
	button_register.classList.add('is-loading');
	button_register.disabled = true;

	try {
		let body = feFormToJSON('form_register');
		let response = await fetch('/api/register', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		let json = await response.json();

		if (json.success) {
			form_register.classList.add('is-hidden');
			box_success.classList.remove('is-hidden');
		} else {
			notification_error.textContent = json.message || '';
			notification_error.classList.remove('is-hidden');
			button_register.classList.remove('is-loading');
			button_register.disabled = false;
			// A captcha-token a szerveroldalon EGYSZER használatos (a sikertelen
			// próbálkozás is elhasználja) — új kérdés nélkül a következő submit
			// biztosan elbukna, ezért mindig töltünk egy frisset.
			loadCaptcha();
		}
	} catch (err) {
		notification_error.classList.remove('is-hidden');
		button_register.classList.remove('is-loading');
		button_register.disabled = false;
		loadCaptcha();
	}
});
