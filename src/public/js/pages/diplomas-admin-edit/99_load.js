async function loadDiploma() {
	if (isNewDiploma) {
		input_id.value = '';
		document.getElementById('input_serial_start').disabled = false;
		return;
	}

	let response = await fetch(`/api/admin/diplomas/${diplomaId}`);
	let json = await response.json();

	if (!json.success) {
		notification_error.textContent = json.message || '';
		notification_error.classList.remove('is-hidden');
		return;
	}

	let d = json.data;

	page_title.textContent = d.name;
	input_id.value = d._id;

	document.getElementById('input_name').value = d.name || '';
	document.getElementById('input_description').value = d.description || '';

	select_diploma_type.value = d.type === 'challenge' ? 'challenge' : 'standard';
	select_diploma_type.dispatchEvent(new Event('change'));

	let challenge = d.challenge || {};
	select_challenge_target_field.value = challenge.targetField || 'call';
	document.getElementById('input_challenge_draw_per_round').value = challenge.drawPerRound || 1;
	document.getElementById('input_challenge_total_rounds').value = challenge.totalRounds || 1;
	document.getElementById('input_challenge_allow_repeat').checked = !!challenge.allowRepeatAcrossRounds;
	document.getElementById('input_challenge_deadline_days').value = challenge.roundDeadlineDays == null ? '' : challenge.roundDeadlineDays;
	document.getElementById('input_challenge_qsl_sample_count').value = challenge.qslSampleCount || 0;
	document.getElementById('input_challenge_allowed_bands').value = Array.isArray(challenge.allowedBands) ? challenge.allowedBands.join(', ') : '';
	document.getElementById('input_challenge_allowed_modes').value = Array.isArray(challenge.allowedModes) ? challenge.allowedModes.join(', ') : '';

	if (Array.isArray(challenge.targetPool)) {
		for (let i = 0, n = challenge.targetPool.length; i < n; i++) {
			addChallengePoolRow(challenge.targetPool[i]);
		}
	}

	let deadlineRadio = document.querySelector(`input[name="deadlineType"][value="${d.deadlineType || 'continuous'}"]`);
	if (deadlineRadio) {
		deadlineRadio.checked = true;
	}
	if (d.deadlineType === 'deadline') {
		field_deadline_date.classList.remove('is-hidden');
		if (d.deadlineDate) {
			document.getElementById('input_deadline_date').value = d.deadlineDate.substring(0, 10);
		}
	}

	document.getElementById('select_status').value = d.status || 'draft';

	let serialStartInput = document.getElementById('input_serial_start');
	serialStartInput.value = d.serialStart || 1;
	serialStartInput.disabled = true;

	// Lásd a pendingManagerId kommentjét (00_init.js) — a select_manager_id
	// opciói egy másik, független fetch-ből (05_manager.js) töltődnek be, ezért
	// itt csak megpróbáljuk beállítani (ha az opciók még nincsenek kész, ez
	// néma no-op, és a 05_manager.js fogja utólag alkalmazni pendingManagerId-ból).
	pendingManagerId = d.managerId || '';
	select_manager_id.value = pendingManagerId;

	let ruleModeRadio = document.querySelector(`input[name="ruleMode"][value="${d.ruleMode || 'checklist'}"]`);
	if (ruleModeRadio) {
		ruleModeRadio.checked = true;
		ruleModeRadio.dispatchEvent(new Event('change'));
	}

	document.getElementById('select_duplicate_policy').value = d.duplicatePolicy || 'per_band_mode';

	document.getElementById('input_allowed_bands').value = Array.isArray(d.allowedBands) ? d.allowedBands.join(', ') : '';

	input_repeater_allowed.checked = d.repeaterAllowed !== false;
	document.getElementById('input_repeater_points').value = d.repeaterPoints || 0;
	syncRepeaterPointsVisibility();

	// Fokozatok/kategóriák betöltése (lásd 25_tiers.js) — szándékosan NEM
	// dispatch-eljük az input_tiers_enabled 'change' eseményét, mert annak van
	// egy kényelmi mellékhatása (üres kategória-sor automatikus hozzáadása), ami
	// itt, valódi mentett adatoknál nem kívánt; helyette közvetlenül állítjuk be
	// az állapotot és a saját sorokat rendereljük.
	input_tiers_enabled.checked = !!d.tiersEnabled;
	input_categories_enabled.checked = !!d.categoriesEnabled;
	tiers_config.classList.toggle('is-hidden', !d.tiersEnabled);
	zone_flat_thresholds.classList.toggle('is-hidden', !!d.tiersEnabled);
	zone_flat_thresholds_tiers_note.classList.toggle('is-hidden', !d.tiersEnabled);

	if (Array.isArray(d.categories)) {
		for (let i = 0, n = d.categories.length; i < n; i++) {
			addCategoryRow(d.categories[i]);
		}
	}

	refreshCategoriesUI();

	if (Array.isArray(d.matchRules)) {
		for (let i = 0, n = d.matchRules.length; i < n; i++) {
			addRuleRow(d.matchRules[i]);
		}
	}

	if (d.zoneThresholds) {
		document.getElementById('input_zone_home').value = d.zoneThresholds.home == null ? '' : d.zoneThresholds.home;
		document.getElementById('input_zone_eu').value = d.zoneThresholds.eu == null ? '' : d.zoneThresholds.eu;
		document.getElementById('input_zone_dx').value = d.zoneThresholds.dx == null ? '' : d.zoneThresholds.dx;
	}

	if (d.homeCountry) {
		document.getElementById('select_home_country').value = d.homeCountry;
	}

	document.getElementById('input_qsl_sample_count').value = d.qslSampleCount || 0;
	document.getElementById('input_auto_approve').checked = !!d.autoApprove;
	applyAutoApproveInterlock();

	if (d.pricing) {
		document.getElementById('input_pdf_fee').value = d.pricing.pdfFee || 0;
		document.getElementById('input_physical_fee').value = d.pricing.physicalFee || 0;
		document.getElementById('select_currency').value = d.pricing.currency || 'EUR';
	}

	document.getElementById('input_physical_offer_enabled').checked = !!d.physicalOfferEnabled;

	if (Array.isArray(d.paymentMethods)) {
		let checkboxes = document.querySelectorAll('.payment-method-cb');
		for (let i = 0, n = checkboxes.length; i < n; i++) {
			checkboxes[i].checked = d.paymentMethods.indexOf(checkboxes[i].value) !== -1;
		}
		input_bank_transfer_cb.dispatchEvent(new Event('change'));
	}

	if (d.bankTransferDetails) {
		document.getElementById('input_bank_account_name').value = d.bankTransferDetails.accountName || '';
		document.getElementById('input_bank_iban').value = d.bankTransferDetails.iban || '';
		document.getElementById('input_bank_note').value = d.bankTransferDetails.note || '';
	}

	// Ha a diplomának már van mentett elrendezése, azt (akár részlegesen, csak
	// néhány mezővel) vesszük át — a jelölőnégyzetek ez alapján állnak be
	// (syncOverlayToggles). Ha még sosem lett elrendezés elmentve, mind a hat
	// alapértelmezett mezővel indulunk (mint egy új diplománál).
	overlayFieldsState = (Array.isArray(d.overlayFields) && d.overlayFields.length)
		? d.overlayFields
		: DEFAULT_ACTIVE_OVERLAY_KEYS.map(k => Object.assign({}, DEFAULT_OVERLAY_FIELDS[k]));

	document.getElementById('select_overlay_font_family').value = d.overlayFontFamily || 'liberation-serif';
	document.getElementById('input_overlay_font_size').value = d.overlayFontSize || 24;

	syncOverlayToggles();

	if (d.blankImage && d.blankImage.key) {
		setBlankImage(`/uploads/diplomas/${diplomaId}/blank?v=${Date.now()}`, `/uploads/diplomas/${diplomaId}/blank-watermarked?v=${Date.now()}`);
	} else {
		document.getElementById('overlay_no_image_notice').classList.remove('is-hidden');
	}
}

loadDiploma();
