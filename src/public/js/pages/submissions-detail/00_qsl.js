feEventSelector('.qsl-file-input', 'onchange', function () {
	let nameEl = this.closest('.file').querySelector('.qsl-file-name');
	nameEl.textContent = this.files.length ? this.files[0].name : '—';
});
