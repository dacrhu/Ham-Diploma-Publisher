const form_forgot = document.getElementById('form_forgot');
const button_forgot = document.getElementById('button_forgot');
const notification_sent = document.getElementById('notification_sent');

feEventId(form_forgot, 'onsubmit', async function (e) {
	e.preventDefault();

	button_forgot.classList.add('is-loading');
	button_forgot.disabled = true;

	try {
		let body = feFormToJSON('form_forgot');
		await fetch('/api/forgot-password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
	} catch (err) {
		// A visszajelzés szándékosan mindig ugyanaz (lásd backend), hálózati
		// hiba esetén is megmutatjuk az "elküldve" üzenetet.
	}

	form_forgot.classList.add('is-hidden');
	notification_sent.classList.remove('is-hidden');
});
