const table_users = document.getElementById('table_users');
const notice_empty = document.getElementById('notice_empty');
const input_search = document.getElementById('input_search');
const select_status_filter = document.getElementById('select_status_filter');
const pagination_bar = document.getElementById('pagination_bar');
const pagination_info = document.getElementById('pagination_info');
const button_prev_page = document.getElementById('button_prev_page');
const button_next_page = document.getElementById('button_next_page');
const table_container = table_users.closest('.table-container');

const MAX_PER_PAGE = 25;
let currentPage = 0;

function escapeHtml(text) {
	let div = document.createElement('div');
	div.textContent = text || '';
	return div.innerHTML;
}

function statusLabel(status) {
	return table_container.dataset['status' + status.charAt(0).toUpperCase() + status.slice(1)] || status;
}

function statusTagClass(status) {
	if (status === 'active') return 'is-success';
	if (status === 'disabled') return 'is-danger';
	return 'is-warning';
}

async function loadUsers() {
	let q = input_search.value.trim();
	let status = select_status_filter.value;
	let url = '/api/admin/users/search?page=' + currentPage + '&max=' + MAX_PER_PAGE;

	if (q) url += '&q=' + encodeURIComponent(q);
	if (status) url += '&status=' + encodeURIComponent(status);

	let response = await fetch(url);
	let json = await response.json();

	table_users.innerHTML = '';

	if (!json.success || !json.data || !json.data.length) {
		notice_empty.classList.remove('is-hidden');
		pagination_bar.classList.add('is-hidden');
		return;
	}

	notice_empty.classList.add('is-hidden');

	for (let i = 0, n = json.data.length; i < n; i++) {
		let u = json.data[i];
		let name = [u.firstName, u.lastName].filter(x => x).join(' ');
		let isManager = !!(u.permissions && u.permissions.indexOf('manager') !== -1);

		let managerHtml = u.sa
			? '<span class="tag is-info">sa</span>'
			: `<label class="checkbox"><input type="checkbox" class="manager-toggle" data-id="${u._id}" ${isManager ? 'checked' : ''}></label>`;

		let actionHtml = u.sa
			? ''
			: (u.status === 'disabled'
				? `<button class="button is-small is-success status-toggle" data-id="${u._id}" data-target="active" data-name="${escapeHtml(u.callsign || u.email)}">${table_container.dataset.actionEnable}</button>`
				: `<button class="button is-small is-danger status-toggle" data-id="${u._id}" data-target="disabled" data-name="${escapeHtml(u.callsign || u.email)}">${table_container.dataset.actionDisable}</button>`);

		let tr = `<tr>
			<td>${escapeHtml(u.callsign)}</td>
			<td>${escapeHtml(name)}</td>
			<td>${escapeHtml(u.email)}</td>
			<td>${escapeHtml(u.country)}</td>
			<td><span class="tag ${statusTagClass(u.status)}">${escapeHtml(statusLabel(u.status))}</span></td>
			<td>${managerHtml}</td>
			<td>${new Date(u.created).toLocaleDateString()}</td>
			<td class="is-flex is-gap-2">
				<a href="/admin/users/${u._id}" class="button is-small is-link is-light">${table_container.dataset.actionDetail}</a>
				${actionHtml}
			</td>
		</tr>`;
		table_users.insertAdjacentHTML('beforeend', tr);
	}

	let pages = Math.max(1, Math.ceil(json.countFull / MAX_PER_PAGE));
	pagination_bar.classList.remove('is-hidden');
	pagination_info.textContent = pagination_info.dataset.template.replace('{0}', currentPage + 1).replace('{1}', pages);
	button_prev_page.disabled = currentPage <= 0;
	button_next_page.disabled = currentPage >= pages - 1;

	feEventSelector('.manager-toggle', 'onchange', async function () {
		let checkbox = this;
		checkbox.disabled = true;

		let response = await fetch('/api/admin/users/set-manager', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: checkbox.dataset.id, manager: checkbox.checked })
		});
		let result = await response.json();

		if (!result.success) {
			checkbox.checked = !checkbox.checked;
		}

		checkbox.disabled = false;
	});

	feEventSelector('.status-toggle', 'onclick', async function () {
		let button = this;
		let target = button.dataset.target;
		let confirmText = (target === 'disabled' ? table_container.dataset.disableConfirm : table_container.dataset.enableConfirm).replace('{0}', button.dataset.name);

		if (!window.confirm(confirmText)) {
			return;
		}

		button.classList.add('is-loading');
		button.disabled = true;

		let response = await fetch('/api/admin/users/' + button.dataset.id + '/status', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ status: target })
		});
		let result = await response.json();

		if (result.success) {
			loadUsers();
		} else {
			button.classList.remove('is-loading');
			button.disabled = false;
		}
	});
}

let searchTimeout = null;

feEventId(input_search, 'oninput', function () {
	clearTimeout(searchTimeout);
	searchTimeout = setTimeout(function () {
		currentPage = 0;
		loadUsers();
	}, 300);
});

feEventId(select_status_filter, 'onchange', function () {
	currentPage = 0;
	loadUsers();
});

feEventId(button_prev_page, 'onclick', function () {
	if (currentPage > 0) {
		currentPage--;
		loadUsers();
	}
});

feEventId(button_next_page, 'onclick', function () {
	currentPage++;
	loadUsers();
});

loadUsers();
