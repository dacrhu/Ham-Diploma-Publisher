// Automatikus elfogadás (autoApprove) — összeegyeztethetetlen a QSL-
// mintavételezéssel és a fizikai kézbesítéssel (lásd
// schemas/diplomas/diplomas.js save action validációját, ami ezt
// szerveroldalon is kikényszeríti). Itt csak felületi kényelemből tiltjuk le
// (és nullázzuk/pipáljuk ki) az ütköző mezőket, hogy a manager ne fusson bele
// a szerveroldali hibaüzenetbe.
const input_auto_approve = document.getElementById('input_auto_approve');

function applyAutoApproveInterlock() {
	let active = input_auto_approve.checked;
	let qslField = document.getElementById('input_qsl_sample_count');
	let physicalField = document.getElementById('input_physical_offer_enabled');

	if (active) {
		qslField.value = 0;
		physicalField.checked = false;
	}

	qslField.disabled = active;
	physicalField.disabled = active;
}

feEventId(input_auto_approve, 'onchange', applyAutoApproveInterlock);
