const panel_login = document.getElementById('panel_login');
const panel_mfa_verify = document.getElementById('panel_mfa_verify');
const panel_mfa_setup_choose = document.getElementById('panel_mfa_setup_choose');
const panel_mfa_setup_confirm = document.getElementById('panel_mfa_setup_confirm');

const form_login = document.getElementById('form_login');
const button_login = document.getElementById('button_login');
const notification_error = document.getElementById('notification_error');
const notification_verify_ok = document.getElementById('notification_verify_ok');
const notification_verify_invalid = document.getElementById('notification_verify_invalid');

const form_mfa_verify = document.getElementById('form_mfa_verify');
const button_mfa_verify = document.getElementById('button_mfa_verify');
const notification_mfa_verify_error = document.getElementById('notification_mfa_verify_error');
const mfa_verify_intro = document.getElementById('mfa_verify_intro');

const button_mfa_method_email = document.getElementById('button_mfa_method_email');
const button_mfa_method_totp = document.getElementById('button_mfa_method_totp');

const mfa_setup_email_block = document.getElementById('mfa_setup_email_block');
const mfa_setup_totp_block = document.getElementById('mfa_setup_totp_block');
const mfa_totp_qr = document.getElementById('mfa_totp_qr');
const mfa_totp_secret = document.getElementById('mfa_totp_secret');
const form_mfa_setup_confirm = document.getElementById('form_mfa_setup_confirm');
const button_mfa_setup_confirm = document.getElementById('button_mfa_setup_confirm');
const notification_mfa_setup_error = document.getElementById('notification_mfa_setup_error');

let verify = new URLSearchParams(window.location.search).get('verify');
if (verify === 'ok') {
	notification_verify_ok.classList.remove('is-hidden');
} else if (verify === 'invalid') {
	notification_verify_invalid.classList.remove('is-hidden');
}

function showPanel(panel) {
	panel_login.classList.add('is-hidden');
	panel_mfa_verify.classList.add('is-hidden');
	panel_mfa_setup_choose.classList.add('is-hidden');
	panel_mfa_setup_confirm.classList.add('is-hidden');
	panel.classList.remove('is-hidden');
}
