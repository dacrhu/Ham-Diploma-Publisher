// Payment (step 10) — the submission owner's payment-method buttons, and the
// manager's bank-transfer-confirmation / mark-as-completed buttons. Looks up
// the submissionId on its own (doesn't rely on 00_init.js's load order,
// because this file is loaded in states MUTUALLY EXCLUSIVE from
// "pending_review" (awaiting_payment/paid), see the import conditions in
// views/submissions/detail.html).
const paymentSubmissionId = document.getElementById('box_submission_detail').dataset.id;
const notification_payment_error = document.getElementById('notification_payment_error');

function showPaymentError(message) {
	if (!notification_payment_error) {
		return;
	}
	notification_payment_error.textContent = message || '';
	notification_payment_error.classList.remove('is-hidden');
}

feEventSelector('.pay-method', 'onclick', async function () {
	let button = this;
	let provider = button.dataset.provider;

	if (notification_payment_error) {
		notification_payment_error.classList.add('is-hidden');
	}
	button.classList.add('is-loading');
	button.disabled = true;

	try {
		let response = await fetch('/api/submissions/' + paymentSubmissionId + '/pay', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ provider: provider })
		});
		let json = await response.json();

		if (!json.success) {
			showPaymentError(json.message);
			button.classList.remove('is-loading');
			button.disabled = false;
			return;
		}

		if (json.redirectUrl) {
			window.location = json.redirectUrl;
			return;
		}

		// bank_transfer: no redirect, the server has already saved the
		// payment intent — after reloading, the "pending" branch is shown
		// with the bank details.
		window.location.reload();
	} catch (err) {
		showPaymentError('');
		button.classList.remove('is-loading');
		button.disabled = false;
	}
});

const button_confirm_bank = document.getElementById('button_confirm_bank');

if (button_confirm_bank) {
	feEventId(button_confirm_bank, 'onclick', async function () {
		if (!window.confirm(button_confirm_bank.dataset.confirm)) {
			return;
		}

		button_confirm_bank.classList.add('is-loading');
		button_confirm_bank.disabled = true;

		try {
			let response = await fetch('/api/submissions/' + paymentSubmissionId + '/pay/bank-confirm', { method: 'POST' });
			let json = await response.json();

			if (!json.success) {
				window.alert(json.message);
				button_confirm_bank.classList.remove('is-loading');
				button_confirm_bank.disabled = false;
				return;
			}

			window.location.reload();
		} catch (err) {
			button_confirm_bank.classList.remove('is-loading');
			button_confirm_bank.disabled = false;
		}
	});
}

const button_mark_completed = document.getElementById('button_mark_completed');

if (button_mark_completed) {
	feEventId(button_mark_completed, 'onclick', async function () {
		if (!window.confirm(button_mark_completed.dataset.confirm)) {
			return;
		}

		button_mark_completed.classList.add('is-loading');
		button_mark_completed.disabled = true;

		try {
			let response = await fetch('/api/submissions/' + paymentSubmissionId + '/complete', { method: 'POST' });
			let json = await response.json();

			if (!json.success) {
				window.alert(json.message);
				button_mark_completed.classList.remove('is-loading');
				button_mark_completed.disabled = false;
				return;
			}

			window.location.reload();
		} catch (err) {
			button_mark_completed.classList.remove('is-loading');
			button_mark_completed.disabled = false;
		}
	});
}
