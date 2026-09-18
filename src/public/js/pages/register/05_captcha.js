// Rádióamatőr-tudást igénylő "captcha" (felhasználói kérésre, botok ellen) —
// lásd modules/band-captcha.js + schemas/users/users.js captchaChallenge
// actionje. A helyes válasz NEM kerül a kliensre, csak a token+kérdés+opciók —
// a submit ($.model.captchaAnswer/captchaToken) szerveroldalon ellenőrződik.
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
		// no-op — a form submit ilyenkor is hiányzó tokennel próbálkozik majd,
		// a szerver elutasítja, a felhasználó az "Másik kérdés" linkkel újrapróbálhatja.
	}
}

feEventId(link_captcha_reload, 'onclick', function (e) {
	e.preventDefault();
	loadCaptcha();
});

loadCaptcha();
