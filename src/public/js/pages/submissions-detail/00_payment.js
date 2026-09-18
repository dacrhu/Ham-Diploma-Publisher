// Fizetés (10. lépés) — a beadvány tulajdonosának fizetési-mód gombjai, és a
// manager banki-utalás-jóváhagyás / teljesítés-jelölés gombjai. Önállóan
// keresi ki a submissionId-t (nem támaszkodik a 00_init.js betöltési
// sorrendjére, mert ez a fájl a "pending_review"-tól ELTÉRŐ, kölcsönösen
// kizáró állapotokban (awaiting_payment/paid) töltődik be, lásd
// views/submissions/detail.html import-feltételeit).
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

		// bank_transfer: nincs átirányítás, a szerver már elmentette a
		// fizetési szándékot — újratöltés után a "függőben" ág jelenik meg
		// a banki adatokkal.
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
