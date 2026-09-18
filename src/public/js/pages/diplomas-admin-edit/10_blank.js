const input_blank_file = document.getElementById('input_blank_file');
const blank_file_name = document.getElementById('blank_file_name');
const blank_preview_wrap = document.getElementById('blank_preview_wrap');
const blank_preview_img = document.getElementById('blank_preview_img');
const blank_upload_status = document.getElementById('blank_upload_status');

// rawUrl: a NYERS (vízjel nélküli) kép — csak az overlay-szerkesztőnek kell a
// pontos pozicionáláshoz, ez az útvonal manager-only (lásd
// controllers/diplomas-admin.js serve_blank). watermarkedUrl: a feltöltéskor
// előre legenerált, TÉNYLEGESEN vízjelezett JPEG (serve_blank_watermarked,
// publikus) — ezt mutatja az "Alapadatok" fül előnézete, hogy az admin ne
// kapjon félrevezető képet arról, mit lát majd egy nem-manager látogató.
function setBlankImage(rawUrl, watermarkedUrl) {
	blank_preview_img.src = watermarkedUrl;
	blank_preview_wrap.classList.remove('is-hidden');

	let overlay_editor_img = document.getElementById('overlay_editor_img');
	let overlay_editor_wrap = document.getElementById('overlay_editor_wrap');
	let overlay_no_image_notice = document.getElementById('overlay_no_image_notice');
	overlay_editor_img.src = rawUrl;
	overlay_editor_wrap.classList.remove('is-hidden');
	overlay_no_image_notice.classList.add('is-hidden');

	let button_preview_render = document.getElementById('button_preview_render');
	if (button_preview_render) {
		button_preview_render.classList.remove('is-hidden');
	}
}

feEventId(input_blank_file, 'onchange', async function () {
	if (!this.files || !this.files.length) {
		return;
	}

	blank_file_name.textContent = this.files[0].name;

	if (isNewDiploma) {
		blank_upload_status.textContent = blank_upload_status.dataset.savefirst || '';
		input_blank_file.value = '';
		return;
	}

	let formData = new FormData();
	formData.append('file', this.files[0]);

	blank_upload_status.textContent = '...';

	try {
		let response = await fetch(`/upload/diplomas/${diplomaId}/blank`, {
			method: 'POST',
			body: formData
		});
		let json = await response.json();

		if (json.success) {
			setBlankImage(json.url, json.watermarkedUrl);
			blank_upload_status.textContent = '';
		} else {
			blank_upload_status.textContent = blank_upload_status.dataset.error || '';
		}
	} catch (err) {
		blank_upload_status.textContent = blank_upload_status.dataset.error || '';
	}
});
