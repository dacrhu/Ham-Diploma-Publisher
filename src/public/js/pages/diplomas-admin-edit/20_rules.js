const match_rules_body = document.getElementById('match_rules_body');
const button_add_rule = document.getElementById('button_add_rule');
const zone_thresholds_block = document.getElementById('zone_thresholds_block');
const mode_values_datalist = document.getElementById('mode_values_datalist');
const mode_groups_datalist = document.getElementById('mode_groups_datalist');
const band_values_datalist = document.getElementById('band_values_datalist');
const band_groups_datalist = document.getElementById('band_groups_datalist');
const input_repeater_allowed = document.getElementById('input_repeater_allowed');
const repeater_points_field = document.getElementById('repeater_points_field');

// Technikai (admin-only) feliratok mezőnként/operátoronként — nyelvenként, mert
// ezek dinamikusan generált <option> elemek, amiket nem tudunk resource-fájlból
// szerver-oldalon renderelni.
//
// FONTOS: a placeholder-t MEZŐ+OPERÁTOR kombinációra kell kulcsolni, nem csak
// operátorra — az "equals"/"in_list" operátor több mezőnél (qth, mode) is
// elérhető, és mezőnként más-más értelmes példa kell (a QTH-nál városnév, a
// MODE-nál rádiós adásmód) — ha csak operátor szerint kulcsoljuk, a QTH
// városnév-példája (Vác, Nagymaros...) rossz helyen (pl. Adásmódnál) is
// megjelenik.
const RULE_I18N = {
	hu: {
		call: 'Hívójel', comment: 'Megjegyzés (COMMENT)', qth: 'QTH', mode: 'Adásmód', band: 'Sáv',
		wildcard: 'Minta (pl. HA1*)', regex: 'Reguláris kifejezés (haladó)', contains: 'Tartalmazza', equals: 'Egyezik', in_list: 'Egyike (vesszővel elválasztva)', group: 'Csoport (pl. DIGITAL / VHF)',
		value_placeholder: {
			call: { wildcard: 'pl. HA1* vagy HA1ABC', regex: 'pl. ^OE\\d[A-Z]{2}$ (csak kétbetűs suffix)' },
			comment: { contains: 'pl. YL', equals: 'pl. YL' },
			qth: { equals: 'pl. Vác', in_list: 'Vác, Nagymaros, Kismaros' },
			mode: { equals: 'pl. FT8', in_list: 'FT8, FT4, RTTY', group: 'CW / PHONE / DIGITAL / IMAGE' },
			band: { equals: 'pl. 80m', in_list: '80m, 40m', group: 'HF / VHF / UHF' }
		}
	},
	en: {
		call: 'Callsign', comment: 'Comment', qth: 'QTH', mode: 'Mode', band: 'Band',
		wildcard: 'Wildcard (e.g. HA1*)', regex: 'Regular expression (advanced)', contains: 'Contains', equals: 'Equals', in_list: 'One of (comma-separated)', group: 'Group (e.g. DIGITAL / VHF)',
		value_placeholder: {
			call: { wildcard: 'e.g. HA1* or HA1ABC', regex: 'e.g. ^OE\\d[A-Z]{2}$ (two-letter suffix only)' },
			comment: { contains: 'e.g. YL', equals: 'e.g. YL' },
			qth: { equals: 'e.g. Vác', in_list: 'Vác, Nagymaros, Kismaros' },
			mode: { equals: 'e.g. FT8', in_list: 'FT8, FT4, RTTY', group: 'CW / PHONE / DIGITAL / IMAGE' },
			band: { equals: 'e.g. 80m', in_list: '80m, 40m', group: 'HF / VHF / UHF' }
		}
	},
	de: {
		call: 'Rufzeichen', comment: 'Kommentar', qth: 'QTH', mode: 'Betriebsart', band: 'Band',
		wildcard: 'Muster (z. B. HA1*)', regex: 'Regulärer Ausdruck (fortgeschritten)', contains: 'Enthält', equals: 'Entspricht', in_list: 'Eines von (kommagetrennt)', group: 'Gruppe (z. B. DIGITAL / VHF)',
		value_placeholder: {
			call: { wildcard: 'z. B. HA1* oder HA1ABC', regex: 'z. B. ^OE\\d[A-Z]{2}$ (nur zweibuchstabiges Suffix)' },
			comment: { contains: 'z. B. YL', equals: 'z. B. YL' },
			qth: { equals: 'z. B. Vác', in_list: 'Vác, Nagymaros, Kismaros' },
			mode: { equals: 'z. B. FT8', in_list: 'FT8, FT4, RTTY', group: 'CW / PHONE / DIGITAL / IMAGE' },
			band: { equals: 'z. B. 80m', in_list: '80m, 40m', group: 'HF / VHF / UHF' }
		}
	}
};

const RULE_LANG = RULE_I18N[document.documentElement.lang] || RULE_I18N.en;

function valuePlaceholderFor(field, operator) {
	let byField = RULE_LANG.value_placeholder[field];
	return (byField && byField[operator]) || '';
}

// A hívójel (call) mezőnél elérhető a 'regex' operátor is — arra az esetre, amikor
// a wildcard (*/?) nem elég precíz (pl. csak-kétbetűs-suffix diploma: ^OE\d[A-Z]{2}$).
// A mode mezőnél a 'group' egy egész adásmód-csoportra illeszkedik (lásd
// modules/adif-modes.js) — így nem kell egyenként felsorolni pl. minden digi módot.
const OPERATORS_BY_FIELD = {
	call: ['wildcard', 'regex'],
	comment: ['contains', 'equals'],
	qth: ['equals', 'in_list'],
	mode: ['equals', 'in_list', 'group'],
	band: ['equals', 'in_list', 'group']
};

// Ugyanaz a csoportosítás, mint a szerveroldali modules/adif-modes.js — csak a
// datalist (autocomplete) kényelmi funkcióhoz kell itt is, nem a tényleges
// illesztéshez (az a 6. lépés rule-engine-jében történik majd).
const MODE_GROUPS = {
	CW: ['CW'],
	PHONE: ['SSB', 'USB', 'LSB', 'FM', 'AM'],
	DIGITAL: ['FT8', 'FT4', 'RTTY', 'PSK31', 'PSK63', 'PSK125', 'JS8', 'JT65', 'JT9', 'JT4', 'WSPR', 'MFSK', 'OLIVIA', 'THOR', 'DOMINO', 'DOMINOEX', 'CONTESTIA', 'MT63', 'HELL', 'FSK441', 'MSK144', 'Q65', 'ROS', 'VARA', 'PACTOR', 'WINMOR', 'ARDOP', 'GTOR', 'AMTORFEC', 'CHIP', 'CLO', 'ISCAT', 'DMR'],
	IMAGE: ['SSTV', 'FAX', 'ATV']
};

// Ugyanaz a csoportosítás, mint a szerveroldali modules/adif-bands.js.
const BAND_GROUPS = {
	HF: ['2200m', '630m', '160m', '80m', '60m', '40m', '30m', '20m', '17m', '15m', '12m', '10m'],
	VHF: ['6m', '4m', '2m', '1.25m'],
	UHF: ['70cm', '33cm', '23cm', '13cm']
};

if (mode_values_datalist) {
	let allModes = [].concat.apply([], Object.keys(MODE_GROUPS).map(g => MODE_GROUPS[g]));
	mode_values_datalist.innerHTML = allModes.map(m => `<option value="${m}">`).join('');
	mode_groups_datalist.innerHTML = Object.keys(MODE_GROUPS).map(g => `<option value="${g}">`).join('');
}

if (band_values_datalist) {
	let allBands = [].concat.apply([], Object.keys(BAND_GROUPS).map(g => BAND_GROUPS[g]));
	band_values_datalist.innerHTML = allBands.map(b => `<option value="${b}">`).join('');
	band_groups_datalist.innerHTML = Object.keys(BAND_GROUPS).map(g => `<option value="${g}">`).join('');
}

function operatorOptionsHtml(field, selected) {
	let ops = OPERATORS_BY_FIELD[field] || [];
	let html = '';
	for (let i = 0, n = ops.length; i < n; i++) {
		html += `<option value="${ops[i]}"${ops[i] === selected ? ' selected' : ''}>${RULE_LANG[ops[i]]}</option>`;
	}
	return html;
}

function valueDatalistFor(field, operator) {
	if (field === 'mode') {
		return operator === 'group' ? 'mode_groups_datalist' : 'mode_values_datalist';
	}
	if (field === 'band') {
		return operator === 'group' ? 'band_groups_datalist' : 'band_values_datalist';
	}
	return '';
}

function addRuleRow(rule) {
	rule = rule || { field: 'call', operator: 'wildcard', value: '', points: 0, label: '' };

	let tr = document.createElement('tr');
	let valueStr = Array.isArray(rule.value) ? rule.value.join(', ') : (rule.value || '');

	tr.innerHTML = `
		<td>
			<div class="select is-small">
				<select class="rule-field">
					<option value="call"${rule.field === 'call' ? ' selected' : ''}>${RULE_LANG.call}</option>
					<option value="comment"${rule.field === 'comment' ? ' selected' : ''}>${RULE_LANG.comment}</option>
					<option value="qth"${rule.field === 'qth' ? ' selected' : ''}>${RULE_LANG.qth}</option>
					<option value="mode"${rule.field === 'mode' ? ' selected' : ''}>${RULE_LANG.mode}</option>
					<option value="band"${rule.field === 'band' ? ' selected' : ''}>${RULE_LANG.band}</option>
				</select>
			</div>
		</td>
		<td><div class="select is-small"><select class="rule-operator">${operatorOptionsHtml(rule.field, rule.operator)}</select></div></td>
		<td><input class="input is-small rule-value" type="text" list="${valueDatalistFor(rule.field, rule.operator)}" value="${escapeAttr(valueStr)}" placeholder="${escapeAttr(valuePlaceholderFor(rule.field, rule.operator))}"></td>
		<td class="rule-points-col"><input class="input is-small rule-points" type="number" min="0" value="${rule.points || 0}"></td>
		<td><input class="input is-small rule-label" type="text" value="${escapeAttr(rule.label || '')}"></td>
		<td><button type="button" class="button is-small is-danger is-light rule-remove"><i class="fas fa-trash"></i></button></td>
	`;

	match_rules_body.appendChild(tr);

	let fieldSelect = tr.querySelector('.rule-field');
	let operatorSelect = tr.querySelector('.rule-operator');
	let valueInput = tr.querySelector('.rule-value');

	fieldSelect.onchange = function () {
		operatorSelect.innerHTML = operatorOptionsHtml(this.value, null);
		valueInput.placeholder = valuePlaceholderFor(this.value, operatorSelect.value);
		valueInput.setAttribute('list', valueDatalistFor(this.value, operatorSelect.value));
	};

	operatorSelect.onchange = function () {
		valueInput.placeholder = valuePlaceholderFor(fieldSelect.value, this.value);
		valueInput.setAttribute('list', valueDatalistFor(fieldSelect.value, this.value));
	};

	tr.querySelector('.rule-remove').onclick = function () {
		tr.remove();
	};
}

function escapeAttr(text) {
	let div = document.createElement('div');
	div.textContent = text || '';
	return div.innerHTML.replace(/"/g, '&quot;');
}

function collectMatchRules() {
	let rows = match_rules_body.querySelectorAll('tr');
	let rules = [];

	for (let i = 0, n = rows.length; i < n; i++) {
		let row = rows[i];
		let field = row.querySelector('.rule-field').value;
		let operator = row.querySelector('.rule-operator').value;
		let rawValue = row.querySelector('.rule-value').value;
		let points = Number(row.querySelector('.rule-points').value) || 0;
		let label = row.querySelector('.rule-label').value;

		if (!rawValue.trim()) {
			continue;
		}

		rules.push({
			field: field,
			operator: operator,
			value: operator === 'in_list' ? rawValue.split(',').map(v => v.trim()).filter(v => v) : rawValue.trim(),
			points: points,
			label: label
		});
	}

	return rules;
}

feEventId(button_add_rule, 'onclick', function () {
	addRuleRow();
});

// Az átjátszó pontértéke csak pontozás módban ÉS csak akkor értelmes, ha az
// átjátszó használata egyáltalán engedélyezett — a két feltétel függetlenül
// változhat (ruleMode rádiógomb, illetve a checkbox), ezért mindkét esemény
// után újra kiértékeljük.
function syncRepeaterPointsVisibility() {
	let isPoints = document.querySelector('input[name="ruleMode"]:checked').value === 'points';
	repeater_points_field.classList.toggle('is-hidden', !isPoints || !input_repeater_allowed.checked);
}

feEventSelector('input[name="ruleMode"]', 'onchange', function () {
	document.body.classList.toggle('rulemode-checklist', this.value === 'checklist');
	zone_thresholds_block.classList.toggle('is-hidden', this.value !== 'points');
	// A tiers_block (fokozatok: Bronz/Ezüst/Arany) a 25_tiers.js-ben van deklarálva,
	// ami ezután a fájl után töltődik be — ez itt egy függvénytörzsben fut le, csak
	// a felhasználó tényleges kattintásakor, addigra a const már létezik.
	tiers_block.classList.toggle('is-hidden', this.value !== 'points');
	syncRepeaterPointsVisibility();
});

feEventId(input_repeater_allowed, 'onchange', syncRepeaterPointsVisibility);

// Kezdeti állapot: checklist mód -> pont oszlop + körzet-küszöbök elrejtve.
document.body.classList.add('rulemode-checklist');
zone_thresholds_block.classList.add('is-hidden');
syncRepeaterPointsVisibility();
