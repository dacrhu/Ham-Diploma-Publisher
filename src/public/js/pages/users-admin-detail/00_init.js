const box_user_detail = document.getElementById('box_user_detail');
const detail_title = document.getElementById('detail_title');
const profile_info = document.getElementById('profile_info');
const field_email = document.getElementById('field_email');
const field_name = document.getElementById('field_name');
const field_callsign = document.getElementById('field_callsign');
const field_country = document.getElementById('field_country');
const field_address = document.getElementById('field_address');
const field_language = document.getElementById('field_language');
const field_status = document.getElementById('field_status');
const field_permissions = document.getElementById('field_permissions');
const field_mfa = document.getElementById('field_mfa');
const field_created = document.getElementById('field_created');
const button_disable = document.getElementById('button_disable');
const button_enable = document.getElementById('button_enable');
const notice_submissions_empty = document.getElementById('notice_submissions_empty');
const submissions_wrap = document.getElementById('submissions_wrap');
const table_submissions = document.getElementById('table_submissions');

const userId = box_user_detail.dataset.id;

function escapeHtml(text) {
	let div = document.createElement('div');
	div.textContent = text || '';
	return div.innerHTML;
}

function statusLabel(status) {
	return profile_info.dataset['status' + status.charAt(0).toUpperCase() + status.slice(1)] || status;
}

function statusTagClass(status) {
	if (status === 'active') return 'is-success';
	if (status === 'disabled') return 'is-danger';
	return 'is-warning';
}

async function loadUser() {
	let response = await fetch('/api/admin/users/' + userId + '/detail');
	let json = await response.json();

	if (!json.success || !json.data) {
		return;
	}

	let u = json.data;
	let name = [u.firstName, u.lastName].filter(x => x).join(' ');
	let address = [u.address && u.address.street, u.address && u.address.city, u.address && u.address.zip].filter(x => x).join(', ');

	detail_title.textContent = detail_title.dataset.template.replace('{0}', u.callsign || u.email);
	field_email.textContent = u.email;
	field_name.textContent = name || '—';
	field_callsign.textContent = u.callsign || '—';
	field_country.textContent = u.country || '—';
	field_address.textContent = address || '—';
	field_language.textContent = (u.language || '').toUpperCase();
	field_status.innerHTML = `<span class="tag ${statusTagClass(u.status)}">${escapeHtml(statusLabel(u.status))}</span>`;

	let permissions = [];
	if (u.sa) permissions.push(profile_info.dataset.permissionsSa);
	if (u.permissions && u.permissions.indexOf('manager') !== -1) permissions.push(profile_info.dataset.permissionsManager);
	field_permissions.textContent = permissions.length ? permissions.join(', ') : profile_info.dataset.permissionsNone;

	field_mfa.textContent = (u.mfa && u.mfa.enabled)
		? profile_info.dataset.mfaEnabled.replace('{0}', u.mfa.method)
		: profile_info.dataset.mfaDisabled;

	field_created.textContent = new Date(u.created).toLocaleDateString();

	if (u.sa) {
		button_disable.classList.add('is-hidden');
		button_enable.classList.add('is-hidden');
	} else if (u.status === 'disabled') {
		button_disable.classList.add('is-hidden');
		button_enable.classList.remove('is-hidden');
	} else {
		button_enable.classList.add('is-hidden');
		button_disable.classList.remove('is-hidden');
	}

	button_disable.dataset.name = u.callsign || u.email;
	button_enable.dataset.name = u.callsign || u.email;
}

async function toggleStatus(target) {
	let button = target === 'disabled' ? button_disable : button_enable;
	let confirmText = (target === 'disabled' ? profile_info.dataset.disableConfirm : profile_info.dataset.enableConfirm).replace('{0}', button.dataset.name);

	if (!window.confirm(confirmText)) {
		return;
	}

	button.classList.add('is-loading');

	let response = await fetch('/api/admin/users/' + userId + '/status', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ status: target })
	});
	let result = await response.json();

	button.classList.remove('is-loading');

	if (result.success) {
		loadUser();
	}
}

feEventId(button_disable, 'onclick', function () { toggleStatus('disabled'); });
feEventId(button_enable, 'onclick', function () { toggleStatus('active'); });

function submissionStatusLabel(status) {
	return table_submissions.closest('table').dataset['status' + status.charAt(0).toUpperCase() + status.slice(1)] || status;
}

async function loadSubmissions() {
	let response = await fetch('/api/admin/users/' + userId + '/submissions');
	let json = await response.json();

	if (!json.success || !json.data || !json.data.length) {
		notice_submissions_empty.classList.remove('is-hidden');
		submissions_wrap.classList.add('is-hidden');
		return;
	}

	submissions_wrap.classList.remove('is-hidden');
	notice_submissions_empty.classList.add('is-hidden');

	let table = table_submissions.closest('table');
	let detailLabel = table.dataset.actionDetail;

	for (let i = 0, n = json.data.length; i < n; i++) {
		let s = json.data[i];
		let tr = `<tr>
			<td>${escapeHtml(s.diplomaInfo ? s.diplomaInfo.name : '—')}</td>
			<td>${escapeHtml(submissionStatusLabel(s.status))}</td>
			<td class="has-text-right">${s.totalPoints != null ? s.totalPoints : '—'}</td>
			<td>${new Date(s.created).toLocaleDateString()}</td>
			<td><a href="/submissions/${s._id}" class="button is-small is-link is-light">${detailLabel}</a></td>
		</tr>`;
		table_submissions.insertAdjacentHTML('beforeend', tr);
	}
}

loadUser();
loadSubmissions();
