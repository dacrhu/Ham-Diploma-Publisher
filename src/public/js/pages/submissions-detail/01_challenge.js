// Challenge submission round-upload forms (views/submissions/detail.html
// challenge branch) — because of the Bulma "file has-name" trap (see
// CLAUDE.md) every upload field needs its own onchange handler that writes
// the selected file's name into the `.file-name` span, otherwise the user
// gets no feedback about the file selection.
const input_challenge_log_file = document.getElementById('input_challenge_log_file');

if (input_challenge_log_file) {
	feEventId(input_challenge_log_file, 'onchange', function () {
		let nameEl = document.getElementById('challenge_log_file_name');
		nameEl.textContent = this.files.length ? this.files[0].name : '—';
	});
}

// The per-round QSL upload table repeats via @{foreach} (a given round can
// have several drawn targets requesting a QSL) — the same delegated,
// class-based pattern as the standard 00_qsl.js, just with its own
// (challenge-specific) class name so it doesn't collide with the standard
// QSL table.
feEventSelector('.challenge-qsl-file-input', 'onchange', function () {
	let nameEl = this.closest('.file').querySelector('.challenge-qsl-file-name');
	nameEl.textContent = this.files.length ? this.files[0].name : '—';
});
