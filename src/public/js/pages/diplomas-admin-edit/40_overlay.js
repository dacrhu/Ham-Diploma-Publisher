const overlay_editor_wrap = document.getElementById('overlay_editor_wrap');
const overlay_editor_img = document.getElementById('overlay_editor_img');
const select_overlay_font_family = document.getElementById('select_overlay_font_family');
const input_overlay_font_size = document.getElementById('input_overlay_font_size');

// Ugyanaz a lista (kulcs -> CSS font-family), mint a szerveroldali
// modules/certificate-renderer.js CERT_RENDERER.FONT_FAMILIES — csak a
// szerkesztő élő előnézetéhez kell itt is, a tényleges renderelés a szerveren
// történik. A betűméret/font mostantól DIPLOMA-szintű, egységes minden mezőre
// (nem mezőnkénti, mint korábban — felhasználói kérésre, mert nem volt hozzá
// admin UI, és összevisszaságot okozott volna).
const FONT_FAMILIES_CSS = {
	'liberation-sans': "'Liberation Sans', Arial, sans-serif",
	'liberation-serif': "'Liberation Serif', 'Times New Roman', serif",
	'eb-garamond': "'EB Garamond', Garamond, serif",
	'dancing-script': "'Dancing Script', cursive"
};

// FONTOS: minden OVERLAY_KEYS-beli mezőnek KELL itt is szerepelnie mindhárom
// nyelven — ha egy kulcs kimarad, a húzható jelölő az elrendezés-szerkesztőn a
// nyers (nem lefordított) `field.key`-t mutatja felirat helyett (ez történt a
// categoryLabel/tierLabel bevezetésekor, a user vette észre böngészőben).
const OVERLAY_LABELS = {
	hu: { callsign: 'Hívójel', applicantName: 'Név', serialNumber: 'Sorszám', diplomaName: 'Diploma neve', issueDate: 'Dátum', points: 'Pontszám', categoryLabel: 'Kategória', tierLabel: 'Fokozat', zoneLabel: 'Körzet' },
	en: { callsign: 'Callsign', applicantName: 'Name', serialNumber: 'Serial no.', diplomaName: 'Diploma name', issueDate: 'Date', points: 'Points', categoryLabel: 'Category', tierLabel: 'Tier', zoneLabel: 'Zone' },
	de: { callsign: 'Rufzeichen', applicantName: 'Name', serialNumber: 'Seriennummer', diplomaName: 'Diplomname', issueDate: 'Datum', points: 'Punkte', categoryLabel: 'Kategorie', tierLabel: 'Stufe', zoneLabel: 'Zone' }
};

const OVERLAY_LANG = OVERLAY_LABELS[document.documentElement.lang] || OVERLAY_LABELS.en;

// Ugyanaz az anchor-logika, mint a szerveroldali certificate-renderer.js
// anchorTransform()-ja — hogy amit itt húzva lát a manager, az tényleg
// egyezzen a "Előnézet" gombbal (és majd a végleges PDF-fel) legenerált
// képpel: left = a szöveg a pozíciótól jobbra nő, right = balra, center =
// köré. Korábban ez a jelölő mindig középre-horgonyzott volt (CSS
// transform:translate(-50%,-50%)) az align-tól függetlenül — ez itt van
// felülírva JS-ből, mezőnként.
function anchorTransformCss(align) {
	if (align === 'left') return 'translateY(-50%)';
	if (align === 'right') return 'translate(-100%, -50%)';
	return 'translate(-50%, -50%)';
}

function renderOverlayHandles() {
	let existing = overlay_editor_wrap.querySelectorAll('.overlay-field-handle');
	for (let i = 0, n = existing.length; i < n; i++) {
		existing[i].remove();
	}

	// A jelölő SAJÁT betűmérete admin-only technikai méretben marad (lásd
	// custom.css .overlay-field-handle — kicsi, hogy húzhatóan kényelmes
	// maradjon), de a FONT CSALÁDOT átvesszük a diploma beállításától, hogy a
	// manager azonnal lássa, milyen betűtípust választott — a tényleges méretet
	// és a valódi tartalmat az "Előnézet" gomb mutatja hitelesen.
	let fontFamilyCss = FONT_FAMILIES_CSS[select_overlay_font_family.value] || FONT_FAMILIES_CSS['liberation-serif'];

	for (let i = 0, n = overlayFieldsState.length; i < n; i++) {
		let field = overlayFieldsState[i];
		let handle = document.createElement('div');
		handle.className = 'overlay-field-handle';
		handle.textContent = OVERLAY_LANG[field.key] || field.key;
		handle.style.top = field.top + '%';
		handle.style.left = field.left + '%';
		handle.style.transform = anchorTransformCss(field.align);
		handle.style.fontFamily = fontFamilyCss;
		bindHandleDrag(handle, field);
		overlay_editor_wrap.appendChild(handle);
	}
}

function bindHandleDrag(handle, field) {
	let dragging = false;

	handle.addEventListener('pointerdown', function (e) {
		dragging = true;
		handle.setPointerCapture(e.pointerId);
	});

	handle.addEventListener('pointermove', function (e) {
		if (!dragging) {
			return;
		}

		let rect = overlay_editor_wrap.getBoundingClientRect();
		let left = ((e.clientX - rect.left) / rect.width) * 100;
		let top = ((e.clientY - rect.top) / rect.height) * 100;

		left = Math.min(100, Math.max(0, left));
		top = Math.min(100, Math.max(0, top));

		handle.style.left = left + '%';
		handle.style.top = top + '%';
		field.left = Math.round(left * 10) / 10;
		field.top = Math.round(top * 10) / 10;
	});

	handle.addEventListener('pointerup', function (e) {
		dragging = false;
		handle.releasePointerCapture(e.pointerId);
	});
}

// A jelölőnégyzetek (melyik mező szerepeljen ennél a diplománál) szinkronba
// hozása az aktuális overlayFieldsState tartalmával.
function syncOverlayToggles() {
	let checkboxes = document.querySelectorAll('.overlay-toggle');
	for (let i = 0, n = checkboxes.length; i < n; i++) {
		let key = checkboxes[i].value;
		checkboxes[i].checked = overlayFieldsState.some(f => f.key === key);
	}
}

feEventSelector('.overlay-toggle', 'onchange', function () {
	let key = this.value;

	if (this.checked) {
		if (!overlayFieldsState.some(f => f.key === key)) {
			overlayFieldsState.push(Object.assign({}, DEFAULT_OVERLAY_FIELDS[key]));
		}
	} else {
		overlayFieldsState = overlayFieldsState.filter(f => f.key !== key);
	}

	renderOverlayHandles();
});

feEventId(overlay_editor_img, 'onload', function () {
	renderOverlayHandles();
});

feEventId(select_overlay_font_family, 'onchange', function () {
	renderOverlayHandles();
});

// Ha a kép a load-eseménykötés pillanatában már be van töltve (cache-elt kép,
// gyors betöltés) — a 'load' esemény ilyenkor nem sül el, ezért itt is renderelünk.
if (overlay_editor_img.complete && overlay_editor_img.naturalWidth) {
	renderOverlayHandles();
}

// --- "Előnézet (demo adatokkal)" — a CSAK admin-oldali, még nem feltétlenül
// elmentett overlayFieldsState-et küldi el a szervernek (Diplomas/Diplomas
// previewRender action), ami VALÓDI (Puppeteer-rel renderelt) JPEG-et ad
// vissza demo szöveggel kitöltve. A gomb csak akkor jelenik meg, ha már van
// feltöltött biankó kép (lásd setBlankImage a 10_blank.js-ben).
const button_preview_render = document.getElementById('button_preview_render');
const preview_render_error = document.getElementById('preview_render_error');
const preview_modal = document.getElementById('preview_modal');
const preview_modal_img = document.getElementById('preview_modal_img');
const preview_modal_close = document.getElementById('preview_modal_close');

feEventId(button_preview_render, 'onclick', async function () {
	preview_render_error.classList.add('is-hidden');
	button_preview_render.classList.add('is-loading');

	try {
		let response = await fetch(`/api/admin/diplomas/${diplomaId}/preview`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				overlayFields: overlayFieldsState,
				overlayFontFamily: select_overlay_font_family.value,
				overlayFontSize: input_overlay_font_size.value
			})
		});

		if (!response.ok) {
			throw new Error('preview render failed');
		}

		let blob = await response.blob();
		preview_modal_img.src = URL.createObjectURL(blob);
		preview_modal.classList.add('is-active');
	} catch (err) {
		preview_render_error.classList.remove('is-hidden');
	}

	button_preview_render.classList.remove('is-loading');
});

function closePreviewModal() {
	preview_modal.classList.remove('is-active');
}

feEventId(preview_modal_close, 'onclick', closePreviewModal);
feEventSelector('#preview_modal .modal-background', 'onclick', closePreviewModal);
