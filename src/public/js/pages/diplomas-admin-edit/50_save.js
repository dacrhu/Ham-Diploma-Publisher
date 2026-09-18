feEventId(form_diploma, 'onsubmit', async function (e) {
	e.preventDefault();

	notification_error.classList.add('is-hidden');
	notification_success.classList.add('is-hidden');
	button_save.classList.add('is-loading');
	button_save.disabled = true;

	let deadlineType = document.querySelector('input[name="deadlineType"]:checked').value;
	let ruleMode = document.querySelector('input[name="ruleMode"]:checked').value;
	let tiersData = collectTiersData();

	let payload = {
		id: isNewDiploma ? null : diplomaId,
		name: document.getElementById('input_name').value,
		description: document.getElementById('input_description').value,
		type: select_diploma_type.value,
		challenge: collectChallengeData(),
		managerId: select_manager_id.value,
		deadlineType: deadlineType,
		deadlineDate: document.getElementById('input_deadline_date').value,
		status: document.getElementById('select_status').value,
		serialStart: document.getElementById('input_serial_start').value,
		ruleMode: ruleMode,
		duplicatePolicy: document.getElementById('select_duplicate_policy').value,
		allowedBands: document.getElementById('input_allowed_bands').value.split(',').map(v => v.trim()).filter(v => v),
		repeaterAllowed: input_repeater_allowed.checked,
		repeaterPoints: document.getElementById('input_repeater_points').value,
		matchRules: collectMatchRules(),
		tiersEnabled: tiersData.tiersEnabled,
		categoriesEnabled: tiersData.categoriesEnabled,
		categories: tiersData.categories,
		zoneThresholds: {
			home: document.getElementById('input_zone_home').value,
			eu: document.getElementById('input_zone_eu').value,
			dx: document.getElementById('input_zone_dx').value
		},
		homeCountry: document.getElementById('select_home_country').value,
		qslSampleCount: document.getElementById('input_qsl_sample_count').value,
		autoApprove: document.getElementById('input_auto_approve').checked,
		pricing: {
			pdfFee: document.getElementById('input_pdf_fee').value,
			physicalFee: document.getElementById('input_physical_fee').value,
			currency: document.getElementById('select_currency').value
		},
		physicalOfferEnabled: document.getElementById('input_physical_offer_enabled').checked,
		paymentMethods: feGetCheckboxValues('paymentMethods'),
		bankTransferDetails: {
			accountName: document.getElementById('input_bank_account_name').value,
			iban: document.getElementById('input_bank_iban').value,
			note: document.getElementById('input_bank_note').value
		},
		overlayFields: overlayFieldsState,
		overlayFontFamily: document.getElementById('select_overlay_font_family').value,
		overlayFontSize: document.getElementById('input_overlay_font_size').value
	};

	try {
		let response = await fetch('/api/admin/diplomas', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		let json = await response.json();

		if (!json.success) {
			notification_error.textContent = json.message || '';
			notification_error.classList.remove('is-hidden');
			button_save.classList.remove('is-loading');
			button_save.disabled = false;
			return;
		}

		if (isNewDiploma) {
			// For a new diploma, uploading the blank image/overlay editing needs a
			// real id -> full reload to the saved diploma's edit page.
			window.location.href = '/admin/diplomas/edit/' + json.id;
			return;
		}

		notification_success.classList.remove('is-hidden');
		button_save.classList.remove('is-loading');
		button_save.disabled = false;
	} catch (err) {
		notification_error.classList.remove('is-hidden');
		button_save.classList.remove('is-loading');
		button_save.disabled = false;
	}
});
