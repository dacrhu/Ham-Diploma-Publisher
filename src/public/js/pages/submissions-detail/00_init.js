const box_submission_detail = document.getElementById('box_submission_detail');
const submissionId = box_submission_detail.dataset.id;
const notification_review_error = document.getElementById('notification_review_error');
const button_points_submit = document.getElementById('button_points_submit');
const button_approve = document.getElementById('button_approve');
const button_reject = document.getElementById('button_reject');
const input_review_remark = document.getElementById('input_review_remark');

function showReviewError(message) {
	notification_review_error.textContent = message || '';
	notification_review_error.classList.remove('is-hidden');
}

feEventId(document.getElementById('form_points'), 'onsubmit', async function (e) {
	e.preventDefault();

	notification_review_error.classList.add('is-hidden');
	button_points_submit.classList.add('is-loading');
	button_points_submit.disabled = true;

	let payload = feFormToJSON('form_points');
	payload.amount = Number(payload.amount);

	try {
		let response = await fetch('/api/submissions/' + submissionId + '/points', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		let json = await response.json();

		if (!json.success) {
			showReviewError(json.message);
			button_points_submit.classList.remove('is-loading');
			button_points_submit.disabled = false;
			return;
		}

		window.location.reload();
	} catch (err) {
		showReviewError('');
		button_points_submit.classList.remove('is-loading');
		button_points_submit.disabled = false;
	}
});

async function submitDecision(button, decision) {
	if (!window.confirm(button.dataset.confirm)) {
		return;
	}

	notification_review_error.classList.add('is-hidden');
	button_approve.disabled = true;
	button_reject.disabled = true;
	button.classList.add('is-loading');

	try {
		let response = await fetch('/api/submissions/' + submissionId + '/decide', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ decision: decision, remark: input_review_remark.value })
		});
		let json = await response.json();

		if (!json.success) {
			showReviewError(json.message);
			button_approve.disabled = false;
			button_reject.disabled = false;
			button.classList.remove('is-loading');
			return;
		}

		window.location.reload();
	} catch (err) {
		showReviewError('');
		button_approve.disabled = false;
		button_reject.disabled = false;
		button.classList.remove('is-loading');
	}
}

feEventId(button_approve, 'onclick', function () {
	submitDecision(button_approve, 'approve');
});

feEventId(button_reject, 'onclick', function () {
	submitDecision(button_reject, 'reject');
});

// Soronkénti (QSO-hoz kötött) kézi korrekció — lásd views/submissions/detail.html
// "qso-correct-row" (kezdetben rejtett) sorát minden QSO-sor alatt, és a
// hozzá tartozó "qso-correct-toggle" (✎) gombot. Vagy egy diploma-szabályt
// választ (a pontérték a szabályból jön, a szerver a diploma AKTUÁLIS
// matchRules-éből olvassa újra, lásd Submissions/Submissions adjustPoints),
// vagy egyéni pontszámot ad meg — a kettő kölcsönösen kizárja egymást (ha a
// szabály-select-en van kiválasztva érték, a szerver figyelmen kívül hagyja
// az "amount" mezőt).
feEventSelector('.qso-correct-toggle', 'onclick', function () {
	let row = document.querySelector('.qso-correct-row[data-qsoref="' + this.dataset.qsoref + '"]');
	if (row) {
		row.classList.toggle('is-hidden');
	}
});

feEventSelector('.qso-correct-apply', 'onclick', async function () {
	let button = this;
	let row = button.closest('.qso-correct-row');
	let qsoref = row.dataset.qsoref;
	let ruleSelect = row.querySelector('.qso-correct-rule');
	let amountInput = row.querySelector('.qso-correct-amount');
	let reasonInput = row.querySelector('.qso-correct-reason');

	let payload = { qsoRef: qsoref, reason: reasonInput.value };

	if (ruleSelect.value !== '') {
		payload.ruleIndex = Number(ruleSelect.value);
		if (!reasonInput.value) {
			payload.reason = ruleSelect.options[ruleSelect.selectedIndex].text;
		}
	} else {
		payload.amount = Number(amountInput.value);
	}

	notification_review_error.classList.add('is-hidden');
	button.classList.add('is-loading');
	button.disabled = true;

	try {
		let response = await fetch('/api/submissions/' + submissionId + '/points', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		let json = await response.json();

		if (!json.success) {
			showReviewError(json.message);
			button.classList.remove('is-loading');
			button.disabled = false;
			return;
		}

		window.location.reload();
	} catch (err) {
		showReviewError('');
		button.classList.remove('is-loading');
		button.disabled = false;
	}
});
