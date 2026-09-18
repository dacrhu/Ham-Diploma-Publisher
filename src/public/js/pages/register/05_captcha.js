// Ham-radio-knowledge "captcha" (at user request, against bots) —
// see modules/band-captcha.js + schemas/users/users.js captchaChallenge
// action. The correct answer is NOT sent to the client, only the
// token+question+options — the submit ($.model.captchaAnswer/captchaToken)
// is validated server-side.
const captcha_question = document.getElementById('captcha_question');
const captcha_options = document.getElementById('captcha_options');
const input_captcha_token = document.getElementById('input_captcha_token');
const link_captcha_reload = document.getElementById('link_captcha_reload');

async function loadCaptcha() {
	captcha_question.textContent = captcha_question.dataset.template ? '…' : '';
	captcha_options.innerHTML = '';
	input_captcha_token.value = '';

	try {
		let response = await fetch('/api/captcha');
		let json = await response.json();

		if (!json.success) {
			return;
		}

		captcha_question.textContent = captcha_question.dataset.template.replace('{0}', json.frequencyKHz);
		input_captcha_token.value = json.token;

		for (let i = 0, n = json.options.length; i < n; i++) {
			let value = json.options[i];
			captcha_options.insertAdjacentHTML('beforeend', `
				<label class="radio mr-4">
					<input type="radio" name="captchaAnswer" value="${value}" required> ${value} m
				</label>
			`);
		}
	} catch (err) {
		// no-op — in this case the form submit will attempt with a missing token,
		// the server rejects it, and the user can retry via the "Another question" link.
	}
}

feEventId(link_captcha_reload, 'onclick', function (e) {
	e.preventDefault();
	loadCaptcha();
});

loadCaptcha();
