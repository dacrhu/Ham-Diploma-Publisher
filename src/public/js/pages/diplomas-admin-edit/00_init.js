const box_diploma_edit = document.getElementById('box_diploma_edit');
const page_title = document.getElementById('page_title');
const form_diploma = document.getElementById('form_diploma');
const input_id = document.getElementById('input_id');
const notification_error = document.getElementById('notification_error');
const notification_success = document.getElementById('notification_success');
const button_save = document.getElementById('button_save');

let diplomaId = box_diploma_edit.dataset.id;
let isNewDiploma = diplomaId === 'new';

// The responsible manager <select> options (05_manager.js) and the diploma data
// (99_load.js) are loaded from two INDEPENDENT, asynchronous fetches — which one
// finishes first is not guaranteed. If the diploma loads first, the select is
// still empty, so setting `.value` would have no effect — that's why we save the
// desired value here, in a shared variable, and both files try to apply it,
// whichever one runs later.
let pendingManagerId = null;

// The default position of every possible overlay field — a given field is
// moved into the active state (overlayFieldsState) from here when the user
// checks its corresponding checkbox (see 40_overlay.js). For a new diploma
// all six are checked at start; for an existing diploma only those that are
// actually present in the saved overlayFields array (see 99_load.js).
// There's no per-field `fontSize` — at the user's request the font size/family
// is diploma-level, uniform for every field (see select_overlay_font_family/
// input_overlay_font_size, 40_overlay.js).
const DEFAULT_OVERLAY_FIELDS = {
	diplomaName: { key: 'diplomaName', top: 15, left: 50, align: 'center' },
	applicantName: { key: 'applicantName', top: 45, left: 50, align: 'center' },
	callsign: { key: 'callsign', top: 55, left: 50, align: 'center' },
	points: { key: 'points', top: 65, left: 50, align: 'center' },
	serialNumber: { key: 'serialNumber', top: 85, left: 20, align: 'left' },
	issueDate: { key: 'issueDate', top: 85, left: 80, align: 'right' },
	// The category/tier fields (e.g. "CW" / "Gold") are only useful for those
	// diplomas where tier usage is enabled on the Rules tab (see 25_tiers.js) —
	// that's why they are NOT included in the DEFAULT_ACTIVE_OVERLAY_KEYS list,
	// and only end up in overlayFieldsState if the user explicitly checks them.
	categoryLabel: { key: 'categoryLabel', top: 72, left: 25, align: 'center' },
	tierLabel: { key: 'tierLabel', top: 72, left: 50, align: 'center' },
	zoneLabel: { key: 'zoneLabel', top: 72, left: 75, align: 'center' }
};

// For a new diploma only these six "basic" fields are active by default.
const DEFAULT_ACTIVE_OVERLAY_KEYS = ['diplomaName', 'applicantName', 'callsign', 'points', 'serialNumber', 'issueDate'];

// Current overlayFields state in memory (managed by 40_overlay.js, read out by
// 50_save.js on submit). For a new diploma it starts with the six default
// fields; for an existing diploma 99_load.js fills it with the actually saved fields.
let overlayFieldsState = isNewDiploma ? DEFAULT_ACTIVE_OVERLAY_KEYS.map(k => Object.assign({}, DEFAULT_OVERLAY_FIELDS[k])) : [];

// --- Tab switching ---
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

// --- Deadline type switching ---
const field_deadline_date = document.getElementById('field_deadline_date');
feEventSelector('input[name="deadlineType"]', 'onchange', function () {
	field_deadline_date.classList.toggle('is-hidden', this.value !== 'deadline');
});

// --- Diploma type switching (standard <-> challenge) ---
// The "Rules" tab's header/content switches by type: for a standard diploma the
// usual checklist/scoring rule-engine settings (rules_standard_block), for a
// challenge diploma the round/draw config (rules_challenge_block, see
// 22_challenge.js) -- the tab itself (data-id="tab_rules") always stays the
// same, only the label and content are swapped.
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
	// The autoApprove checkbox is visible for both types (see
	// 21_autoapprove.js) -- the interlock needs to be re-run on type switch,
	// so that a leftover non-zero value in the OTHER type's (now hidden) QSL
	// field doesn't contradict the checkbox state.
	applyAutoApproveInterlock();
});
