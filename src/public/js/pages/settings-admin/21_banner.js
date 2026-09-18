const input_banner_file = document.getElementById('input_banner_file');
const banner_file_name = document.getElementById('banner_file_name');
const banner_preview_wrap = document.getElementById('banner_preview_wrap');
const banner_preview_img = document.getElementById('banner_preview_img');
const banner_upload_status = document.getElementById('banner_upload_status');

function setBannerPreview(url) {
	banner_preview_img.src = url;
	banner_preview_wrap.classList.remove('is-hidden');
}

feEventId(input_banner_file, 'onchange', async function () {
	if (!this.files || !this.files.length) {
		return;
	}

	banner_file_name.textContent = this.files[0].name;

	let formData = new FormData();
	formData.append('file', this.files[0]);

	banner_upload_status.textContent = '...';

	try {
		let response = await fetch('/upload/site/banner', {
			method: 'POST',
			body: formData
		});
		let json = await response.json();

		if (json.success) {
			setBannerPreview(json.url);
			banner_upload_status.textContent = '';
		} else {
			banner_upload_status.textContent = banner_upload_status.dataset.error || '';
		}
	} catch (err) {
		banner_upload_status.textContent = banner_upload_status.dataset.error || '';
	}
});
