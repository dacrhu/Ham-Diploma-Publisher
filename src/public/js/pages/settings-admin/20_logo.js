const input_logo_file = document.getElementById('input_logo_file');
const logo_file_name = document.getElementById('logo_file_name');
const logo_preview_wrap = document.getElementById('logo_preview_wrap');
const logo_preview_img = document.getElementById('logo_preview_img');
const logo_upload_status = document.getElementById('logo_upload_status');

function setLogoPreview(url) {
	logo_preview_img.src = url;
	logo_preview_wrap.classList.remove('is-hidden');
}

feEventId(input_logo_file, 'onchange', async function () {
	if (!this.files || !this.files.length) {
		return;
	}

	logo_file_name.textContent = this.files[0].name;

	let formData = new FormData();
	formData.append('file', this.files[0]);

	logo_upload_status.textContent = '...';

	try {
		let response = await fetch('/upload/site/logo', {
			method: 'POST',
			body: formData
		});
		let json = await response.json();

		if (json.success) {
			setLogoPreview(json.url);
			logo_upload_status.textContent = '';
		} else {
			logo_upload_status.textContent = logo_upload_status.dataset.error || '';
		}
	} catch (err) {
		logo_upload_status.textContent = logo_upload_status.dataset.error || '';
	}
});
