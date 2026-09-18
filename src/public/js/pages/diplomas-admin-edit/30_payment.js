const input_bank_transfer_cb = document.getElementById('input_bank_transfer_cb');
const bank_transfer_fields = document.getElementById('bank_transfer_fields');

feEventId(input_bank_transfer_cb, 'onchange', function () {
	bank_transfer_fields.classList.toggle('is-hidden', !this.checked);
});
