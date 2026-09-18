const box_diploma_edit = document.getElementById('box_diploma_edit');
const page_title = document.getElementById('page_title');
const form_diploma = document.getElementById('form_diploma');
const input_id = document.getElementById('input_id');
const notification_error = document.getElementById('notification_error');
const notification_success = document.getElementById('notification_success');
const button_save = document.getElementById('button_save');

let diplomaId = box_diploma_edit.dataset.id;
let isNewDiploma = diplomaId === 'new';

// A felelős manager <select> opciói (05_manager.js) és a diploma adatai
// (99_load.js) két FÜGGETLEN, aszinkron fetch-ből töltődnek be — nem garantált,
// melyik ér célba előbb. Ha a diploma előbb töltődik be, a select még üres, a
// `.value` beállítás nem hatna — ezért ide, egy közös változóba mentjük a
// kívánt értéket, és mindkét fájl megpróbálja alkalmazni, amelyik később fut le.
let pendingManagerId = null;

// Az összes lehetséges overlay-mező alapértelmezett pozíciója — ebből kerül be
// egy-egy mező az aktív állapotba (overlayFieldsState), amikor a felhasználó
// bepipálja a hozzá tartozó jelölőnégyzetet (lásd 40_overlay.js). Új diplománál
// mind a hat induláskor be van pipálva; meglévő diplománál csak azok, amik
// ténylegesen szerepelnek a mentett overlayFields tömbben (lásd 99_load.js).
// Nincs mezőnkénti `fontSize` — felhasználói kérésre a betűméret/font diploma-
// szintű, egységes minden mezőre (lásd select_overlay_font_family/
// input_overlay_font_size, 40_overlay.js).
const DEFAULT_OVERLAY_FIELDS = {
	diplomaName: { key: 'diplomaName', top: 15, left: 50, align: 'center' },
	applicantName: { key: 'applicantName', top: 45, left: 50, align: 'center' },
	callsign: { key: 'callsign', top: 55, left: 50, align: 'center' },
	points: { key: 'points', top: 65, left: 50, align: 'center' },
	serialNumber: { key: 'serialNumber', top: 85, left: 20, align: 'left' },
	issueDate: { key: 'issueDate', top: 85, left: 80, align: 'right' },
	// A kategória/fokozat mezők (pl. "CW" / "Arany") csak azoknál a diplomáknál
	// hasznosak, ahol a Szabályok fülön be van kapcsolva a fokozatok használata
	// (lásd 25_tiers.js) — ezért ezek NEM szerepelnek a DEFAULT_ACTIVE_OVERLAY_KEYS
	// listában, csak akkor kerülnek az overlayFieldsState-be, ha a felhasználó
	// kifejezetten bepipálja őket.
	categoryLabel: { key: 'categoryLabel', top: 72, left: 25, align: 'center' },
	tierLabel: { key: 'tierLabel', top: 72, left: 50, align: 'center' },
	zoneLabel: { key: 'zoneLabel', top: 72, left: 75, align: 'center' }
};

// Új diplománál csak ez a hat "alap" mező aktív alapból.
const DEFAULT_ACTIVE_OVERLAY_KEYS = ['diplomaName', 'applicantName', 'callsign', 'points', 'serialNumber', 'issueDate'];

// Aktuális overlayFields állapot memóriában (a 40_overlay.js kezeli, a 50_save.js
// a submitnál olvassa ki). Új diplománál a hat alapértelmezett mezővel indul;
// meglévő diplománál a 99_load.js tölti fel a ténylegesen mentett mezőkkel.
let overlayFieldsState = isNewDiploma ? DEFAULT_ACTIVE_OVERLAY_KEYS.map(k => Object.assign({}, DEFAULT_OVERLAY_FIELDS[k])) : [];

// --- Tab váltás ---
feEventClass('tab', 'onclick', function () {
	let tabs = document.querySelectorAll('.tabs .tab');
	for (let i = 0, n = tabs.length; i < n; i++) {
		tabs[i].classList.remove('is-active');
	}
	this.classList.add('is-active');

	let panels = ['tab_basic', 'tab_rules', 'tab_payment', 'tab_overlay'];
	for (let i = 0, n = panels.length; i < n; i++) {
		document.getElementById(panels[i]).classList.toggle('is-hidden', panels[i] !== this.dataset.id);
	}
});

// --- Határidő típus váltás ---
const field_deadline_date = document.getElementById('field_deadline_date');
feEventSelector('input[name="deadlineType"]', 'onchange', function () {
	field_deadline_date.classList.toggle('is-hidden', this.value !== 'deadline');
});

// --- Diploma-típus váltás (standard <-> challenge) ---
// A "Szabályok" fül fejléce/tartalma típus szerint vált: standard diplománál a
// megszokott checklist/pontozás rule-engine beállítások (rules_standard_block),
// challenge diplománál a kör/sorsolás-config (rules_challenge_block, lásd
// 22_challenge.js) -- a fül maga (data-id="tab_rules") mindig ugyanaz marad,
// csak a felirat és a tartalom cserélődik.
const select_diploma_type = document.getElementById('select_diploma_type');
const tab_rules_label = document.getElementById('tab_rules_label');
const rules_standard_block = document.getElementById('rules_standard_block');
const rules_challenge_block = document.getElementById('rules_challenge_block');
const TAB_RULES_LABEL_TEXT = { standard: tab_rules_label.textContent, challenge: tab_rules_label.dataset.challengeLabel };

feEventId(select_diploma_type, 'onchange', function () {
	let isChallenge = this.value === 'challenge';
	rules_standard_block.classList.toggle('is-hidden', isChallenge);
	rules_challenge_block.classList.toggle('is-hidden', !isChallenge);
	tab_rules_label.textContent = isChallenge ? TAB_RULES_LABEL_TEXT.challenge : TAB_RULES_LABEL_TEXT.standard;
});
