// Automatic approval (autoApprove) — available for both diploma types (the
// checkbox itself lives OUTSIDE rules_standard_block/rules_challenge_block,
// always visible, see views/diplomas-admin/edit.html), but incompatible with
// QSL sampling and physical delivery (see the save action's validation in
// schemas/diplomas/diplomas.js, which enforces this server-side too as well).
// Here we only disable (and zero/uncheck) the conflicting fields for UI
// convenience, so the manager doesn't run into the server-side error message.
// The QSL sampling field differs PER TYPE (standard: input_qsl_sample_count,
// challenge: input_challenge_qsl_sample_count) — see the same distinction on
// the server side in `effectiveQslSampleCount`.
const input_auto_approve = document.getElementById('input_auto_approve');

function applyAutoApproveInterlock() {
	let active = input_auto_approve.checked;
	let qslFieldId = select_diploma_type.value === 'challenge' ? 'input_challenge_qsl_sample_count' : 'input_qsl_sample_count';
	let qslField = document.getElementById(qslFieldId);
	let physicalField = document.getElementById('input_physical_offer_enabled');

	if (active) {
		qslField.value = 0;
		physicalField.checked = false;
	}

	qslField.disabled = active;
	physicalField.disabled = active;
}

feEventId(input_auto_approve, 'onchange', applyAutoApproveInterlock);
