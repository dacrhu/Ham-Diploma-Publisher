// Challenge diploma (application -> per-round draw from a target pool) --
// admin-side CONFIGURATION only, the actual draw/round-matching is a
// LATER step (see the comment at the top of schemas/diplomas/diplomas.js).
// Follows the same dynamic row-table pattern as the matchRules table
// (20_rules.js).
const challenge_pool_body = document.getElementById('challenge_pool_body');
const button_add_challenge_pool_item = document.getElementById('button_add_challenge_pool_item');
const select_challenge_target_field = document.getElementById('select_challenge_target_field');

function addChallengePoolRow(item) {
	item = item || { value: '', label: '' };

	let tr = document.createElement('tr');
	tr.innerHTML = `
		<td><input class="input is-small challenge-pool-value" type="text" value="${escapeAttr(item.value || '')}"></td>
		<td><input class="input is-small challenge-pool-label" type="text" value="${escapeAttr(item.label || '')}"></td>
		<td><button type="button" class="button is-small is-danger is-light challenge-pool-remove"><i class="fas fa-trash"></i></button></td>
	`;

	challenge_pool_body.appendChild(tr);

	tr.querySelector('.challenge-pool-remove').onclick = function () {
		tr.remove();
	};
}

function collectChallengePool() {
	let rows = challenge_pool_body.querySelectorAll('tr');
	let pool = [];

	for (let i = 0, n = rows.length; i < n; i++) {
		let row = rows[i];
		let value = row.querySelector('.challenge-pool-value').value;

		if (!value.trim()) {
			continue;
		}

		pool.push({
			value: value.trim(),
			label: row.querySelector('.challenge-pool-label').value.trim()
		});
	}

	return pool;
}

function collectChallengeData() {
	return {
		targetField: select_challenge_target_field.value,
		targetPool: collectChallengePool(),
		drawPerRound: document.getElementById('input_challenge_draw_per_round').value,
		totalRounds: document.getElementById('input_challenge_total_rounds').value,
		allowRepeatAcrossRounds: document.getElementById('input_challenge_allow_repeat').checked,
		roundDeadlineDays: document.getElementById('input_challenge_deadline_days').value || null,
		qslSampleCount: document.getElementById('input_challenge_qsl_sample_count').value,
		allowedBands: document.getElementById('input_challenge_allowed_bands').value.split(',').map(v => v.trim()).filter(v => v),
		allowedModes: document.getElementById('input_challenge_allowed_modes').value.split(',').map(v => v.trim()).filter(v => v),
		commentFilterRegex: document.getElementById('input_challenge_comment_filter_regex').value.trim()
	};
}

feEventId(button_add_challenge_pool_item, 'onclick', function () {
	addChallengePoolRow();
});
