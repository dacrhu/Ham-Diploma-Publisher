const input_submission_file = document.getElementById('input_submission_file');
const submission_file_name = document.getElementById('submission_file_name');

feEventId(input_submission_file, 'onchange', function () {
	submission_file_name.textContent = this.files.length ? this.files[0].name : '—';
});
