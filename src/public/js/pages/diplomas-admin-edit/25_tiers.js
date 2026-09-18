// Fokozatok (pl. Bronz/Ezüst/Arany) és opcionális adásmód szerinti kategóriák
// (pl. CW/Phone/Mixed, mindegyiknek saját fokozat-létrával) — csak pontozás
// módban értelmezett, lásd a tiers_block is-hidden váltását a 20_rules.js
// ruleMode-onchange kezelőjében. A tényleges kiértékelés (melyik kategória és
// fokozat teljesült egy beadványnál) a 6. lépés rule-engine-jében történik majd
// — ez itt csak az admin-oldali beállítás.
//
// FONTOS: a kategóriának NINCS szabadon beírható neve — a felhasználó jelezte,
// hogy egy külön "Kategória neve" mező zavaró volt, nem világos a kapcsolata az
// adásmód-szűrővel. Ehelyett a kategória címkéje MINDIG az adásmód-szűrőből
// származik (lásd a szerveroldali categoryLabelFor()-t is,
// schemas/diplomas/diplomas.js-ben) — a manager csak a szűrőt választja ki.
//
// FONTOS #2: a user rájött, hogy a diplománál már meglévő körzet szerinti
// (hazai/EU/DX) minimum ponthatár koncepció a fokozatokra is vonatkozik — ha
// egy diplománál a sima (fokozat nélküli) minimum körzetenként más, akkor egy
// adott fokozat (pl. "Bronz") elérési küszöbe is más lehet körzetenként. Ezért
// egy fokozat `minPoints`-a NEM egyetlen szám, hanem `{home, eu, dx}` — pont
// úgy, mint a diploma-szintű `zoneThresholds`. Ha fokozatok vannak bekapcsolva,
// a diploma-szintű sima `zoneThresholds` blokk elrejtésre kerül (lásd
// zone_flat_thresholds/zone_flat_thresholds_tiers_note), mert a szerepét ekkor
// a fokozatonkénti körzet-küszöbök veszik át — a `homeCountry` viszont továbbra
// is kell (az dönti el, melyik körzetbe esik a jelentkező).
const input_tiers_enabled = document.getElementById('input_tiers_enabled');
const input_categories_enabled = document.getElementById('input_categories_enabled');
const tiers_block = document.getElementById('tiers_block');
const tiers_config = document.getElementById('tiers_config');
const categories_body = document.getElementById('categories_body');
const button_add_category = document.getElementById('button_add_category');
const zone_flat_thresholds = document.getElementById('zone_flat_thresholds');
const zone_flat_thresholds_tiers_note = document.getElementById('zone_flat_thresholds_tiers_note');

// Dinamikusan generált (JS-ben renderelt) mezőcímkék — ugyanaz a minta, mint a
// 20_rules.js RULE_I18N-jénél: ezek a szövegek nem statikus HTML-ben vannak,
// hanem futásidőben, tetszőleges számú kategória/fokozat-sorhoz generálódnak,
// ezért nem tudjuk @(#kulcs) resource-interpolációval szerver-oldalon renderelni
// (a többi, statikus felirat a resource fájlokban van, lásd edit.html). A
// group_hint_* szövegek az adásmód-szűrő <option>-jeinek `title` tooltipje —
// főleg az "Image" csoportnál hasznos, mert az kevésbé magától értetődő
// (SSTV/FAX/ATV — képi adásmódok), mint a CW/Phone/Digital. A zone_* szövegek
// ugyanazok a rövid körzet-nevek, mint a diplomas.zone.home/eu/dx resource
// kulcsoknál — itt csak a fokozat-táblázat fejlécéhez kellenek duplikálva.
const TIERS_I18N = {
	hu: {
		category_mode_label: 'Adásmód szűrő',
		category_mode_any: 'Mind (Mixed)',
		category_remove: 'Kategória törlése',
		tier_name_placeholder: 'pl. Bronz',
		tier_name_col: 'Fokozat',
		tier_add: 'Fokozat hozzáadása',
		zone_home_col: 'Hazai',
		zone_eu_col: 'EU',
		zone_dx_col: 'DX',
		group_hint_cw: 'Morze (CW)',
		group_hint_phone: 'Hangalapú adásmódok: SSB, FM, AM',
		group_hint_digital: 'Digitális adásmódok: FT8, RTTY, PSK31, JS8, stb.',
		group_hint_image: 'Képi adásmódok: SSTV (lassú letapogatású TV), FAX, ATV (amatőr televízió)'
	},
	en: {
		category_mode_label: 'Mode filter',
		category_mode_any: 'Any (Mixed)',
		category_remove: 'Remove category',
		tier_name_placeholder: 'e.g. Bronze',
		tier_name_col: 'Tier',
		tier_add: 'Add tier',
		zone_home_col: 'Home',
		zone_eu_col: 'EU',
		zone_dx_col: 'DX',
		group_hint_cw: 'Morse code (CW)',
		group_hint_phone: 'Voice modes: SSB, FM, AM',
		group_hint_digital: 'Digital modes: FT8, RTTY, PSK31, JS8, etc.',
		group_hint_image: 'Image modes: SSTV (slow-scan TV), FAX, ATV (amateur television)'
	},
	de: {
		category_mode_label: 'Betriebsart-Filter',
		category_mode_any: 'Alle (Mixed)',
		category_remove: 'Kategorie entfernen',
		tier_name_placeholder: 'z. B. Bronze',
		tier_name_col: 'Stufe',
		tier_add: 'Stufe hinzufügen',
		zone_home_col: 'Heimat',
		zone_eu_col: 'EU',
		zone_dx_col: 'DX',
		group_hint_cw: 'Morsetelegrafie (CW)',
		group_hint_phone: 'Sprachbetriebsarten: SSB, FM, AM',
		group_hint_digital: 'Digitale Betriebsarten: FT8, RTTY, PSK31, JS8 usw.',
		group_hint_image: 'Bildbetriebsarten: SSTV (Schmalband-Fernsehen), FAX, ATV (Amateurfernsehen)'
	}
};

const TIERS_LANG = TIERS_I18N[document.documentElement.lang] || TIERS_I18N.en;

const CATEGORY_GROUP_HINTS = {
	CW: TIERS_LANG.group_hint_cw,
	PHONE: TIERS_LANG.group_hint_phone,
	DIGITAL: TIERS_LANG.group_hint_digital,
	IMAGE: TIERS_LANG.group_hint_image
};

function categoryModeOptionsHtml(selected) {
	let html = `<option value="">${TIERS_LANG.category_mode_any}</option>`;
	let groups = Object.keys(MODE_GROUPS);

	for (let i = 0, n = groups.length; i < n; i++) {
		let g = groups[i];
		html += `<option value="${g}" title="${escapeAttr(CATEGORY_GROUP_HINTS[g] || '')}"${g === selected ? ' selected' : ''}>${g}</option>`;
	}

	return html;
}

function addTierRow(tierBody, tier) {
	tier = tier || { label: '', minPoints: {} };
	let minPoints = tier.minPoints || {};

	let tr = document.createElement('tr');
	tr.innerHTML = `
		<td><input class="input is-small tier-label" type="text" value="${escapeAttr(tier.label || '')}" placeholder="${TIERS_LANG.tier_name_placeholder}"></td>
		<td><input class="input is-small tier-points-home" type="number" min="0" value="${minPoints.home || 0}"></td>
		<td><input class="input is-small tier-points-eu" type="number" min="0" value="${minPoints.eu || 0}"></td>
		<td><input class="input is-small tier-points-dx" type="number" min="0" value="${minPoints.dx || 0}"></td>
		<td><button type="button" class="button is-small is-danger is-light tier-remove"><i class="fas fa-trash"></i></button></td>
	`;

	tierBody.appendChild(tr);
	tr.querySelector('.tier-remove').onclick = function () {
		tr.remove();
	};
}

function addCategoryRow(category) {
	category = category || { modeFilter: '', tiers: [] };

	let box = document.createElement('div');
	box.className = 'box category-row';
	box.innerHTML = `
		<div class="columns is-mobile is-vcentered category-header">
			<div class="field column">
				<label class="label is-small">${TIERS_LANG.category_mode_label}</label>
				<div class="select is-small">
					<select class="category-mode">${categoryModeOptionsHtml(category.modeFilter)}</select>
				</div>
			</div>
			<div class="field column is-narrow">
				<label class="label is-small">&nbsp;</label>
				<button type="button" class="button is-small is-danger is-light category-remove">
					<span class="icon"><i class="fas fa-trash"></i></span>
					<span>${TIERS_LANG.category_remove}</span>
				</button>
			</div>
		</div>
		<table class="table is-fullwidth is-narrow">
			<thead>
				<tr>
					<th>${TIERS_LANG.tier_name_col}</th>
					<th>${TIERS_LANG.zone_home_col}</th>
					<th>${TIERS_LANG.zone_eu_col}</th>
					<th>${TIERS_LANG.zone_dx_col}</th>
					<th></th>
				</tr>
			</thead>
			<tbody class="tier-body"></tbody>
		</table>
		<button type="button" class="button is-small tier-add">
			<span class="icon"><i class="fas fa-plus"></i></span>
			<span>${TIERS_LANG.tier_add}</span>
		</button>
	`;

	categories_body.appendChild(box);

	let tierBody = box.querySelector('.tier-body');
	let tiers = Array.isArray(category.tiers) ? category.tiers : [];

	for (let i = 0, n = tiers.length; i < n; i++) {
		addTierRow(tierBody, tiers[i]);
	}

	box.querySelector('.category-remove').onclick = function () {
		box.remove();
	};

	box.querySelector('.tier-add').onclick = function () {
		addTierRow(tierBody);
	};
}

// Ha nincsenek bekapcsolva az adásmód szerinti kategóriák, csak 1 (implicit
// "Mixed") kategória-sor maradhat, és rajta elrejtjük az adásmód-szűrőt +
// törlés gombot (marad a puszta fokozat-táblázat) — lásd a szerveroldali
// sanitizeCategories() ugyanezt kényszeríti ki.
function refreshCategoriesUI() {
	let categoriesEnabled = input_categories_enabled.checked;

	if (!categoriesEnabled) {
		let rows = categories_body.querySelectorAll('.category-row');
		for (let i = 1, n = rows.length; i < n; i++) {
			rows[i].remove();
		}
	}

	button_add_category.classList.toggle('is-hidden', !categoriesEnabled);

	let rows = categories_body.querySelectorAll('.category-row');
	for (let i = 0, n = rows.length; i < n; i++) {
		rows[i].querySelector('.category-header').classList.toggle('is-hidden', !categoriesEnabled);
	}
}

function collectTiersData() {
	if (!input_tiers_enabled.checked) {
		return { tiersEnabled: false, categoriesEnabled: false, categories: [] };
	}

	let categoriesEnabled = input_categories_enabled.checked;
	let rows = categories_body.querySelectorAll('.category-row');
	let categories = [];

	for (let i = 0, n = rows.length; i < n; i++) {
		let row = rows[i];
		let modeFilter = row.querySelector('.category-mode').value;
		let tierRows = row.querySelectorAll('.tier-body tr');
		let tiers = [];

		for (let j = 0, m = tierRows.length; j < m; j++) {
			let tierRow = tierRows[j];
			let tierLabel = tierRow.querySelector('.tier-label').value;

			if (!tierLabel.trim()) {
				continue;
			}

			tiers.push({
				label: tierLabel.trim(),
				minPoints: {
					home: Number(tierRow.querySelector('.tier-points-home').value) || 0,
					eu: Number(tierRow.querySelector('.tier-points-eu').value) || 0,
					dx: Number(tierRow.querySelector('.tier-points-dx').value) || 0
				}
			});
		}

		if (!tiers.length) {
			continue;
		}

		categories.push({
			modeFilter: categoriesEnabled ? modeFilter : '',
			tiers: tiers
		});
	}

	return { tiersEnabled: true, categoriesEnabled: categoriesEnabled, categories: categories };
}

feEventId(input_tiers_enabled, 'onchange', function () {
	tiers_config.classList.toggle('is-hidden', !this.checked);
	zone_flat_thresholds.classList.toggle('is-hidden', this.checked);
	zone_flat_thresholds_tiers_note.classList.toggle('is-hidden', !this.checked);

	if (this.checked && !categories_body.querySelector('.category-row')) {
		addCategoryRow();
		refreshCategoriesUI();
	}
});

feEventId(input_categories_enabled, 'onchange', function () {
	refreshCategoriesUI();
});

feEventId(button_add_category, 'onclick', function () {
	addCategoryRow();
	refreshCategoriesUI();
});

// Kezdeti állapot: checklist mód -> a teljes tiers_block elrejtve (lásd
// 20_rules.js), a fokozat-beállítások (tiers_config) pedig alapból kikapcsolt
// állapotot mutatnak, amíg a felhasználó be nem pipálja.
tiers_block.classList.add('is-hidden');
