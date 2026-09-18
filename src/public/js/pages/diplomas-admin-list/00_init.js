const table_diplomas = document.getElementById('table_diplomas');
const notice_empty = document.getElementById('notice_empty');
const table_diplomas_el = document.querySelector('table');
const deleteConfirmText = table_diplomas_el.dataset.deleteConfirm || 'Delete {0}?';
const typeLabels = { standard: table_diplomas_el.dataset.typeStandard || 'Standard', challenge: table_diplomas_el.dataset.typeChallenge || 'Challenge' };

async function loadDiplomas() {
	let response = await fetch('/api/admin/diplomas?max=100');
	let json = await response.json();

	table_diplomas.innerHTML = '';

	if (!json.success || !json.data || !json.data.length) {
		notice_empty.classList.remove('is-hidden');
		return;
	}

	notice_empty.classList.add('is-hidden');

	for (let i = 0, n = json.data.length; i < n; i++) {
		let d = json.data[i];
		let created = d.created ? new Date(d.created).toLocaleDateString() : '';
		// managerInfo-t a szerver (Diplomas/Diplomas query action) állítja elő a
		// diploma managerId mezőjéből (lásd schemas/diplomas/diplomas.js
		// attachManagerInfo) — null, ha nincs kijelölve felelős manager.
		let managerText = d.managerInfo ? (d.managerInfo.callsign || d.managerInfo.email) : '—';
		let isChallenge = d.type === 'challenge';
		let tr = `<tr data-id="${d._id}">
			<td class="pointer row-open">${escapeHtml(d.name)}</td>
			<td class="pointer row-open"><span class="tag ${isChallenge ? 'is-link' : ''}">${escapeHtml(isChallenge ? typeLabels.challenge : typeLabels.standard)}</span></td>
			<td class="pointer row-open">${isChallenge ? '—' : escapeHtml(d.ruleMode)}</td>
			<td class="pointer row-open"><span class="tag">${escapeHtml(d.status)}</span></td>
			<td class="pointer row-open">${escapeHtml(managerText)}</td>
			<td class="pointer row-open">${created}</td>
			<td><button type="button" class="button is-small is-danger is-light row-delete" data-id="${d._id}" data-name="${escapeHtml(d.name)}"><i class="fas fa-trash"></i></button></td>
		</tr>`;
		table_diplomas.insertAdjacentHTML('beforeend', tr);
	}

	feEventSelector('.row-open', 'onclick', function () {
		window.location.href = '/admin/diplomas/edit/' + this.parentNode.dataset.id;
	});

	feEventSelector('.row-delete', 'onclick', async function (e) {
		e.stopPropagation();

		if (!window.confirm(deleteConfirmText.replace('{0}', this.dataset.name))) {
			return;
		}

		let response = await fetch('/api/admin/diplomas/delete', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: this.dataset.id })
		});
		let json = await response.json();

		if (json.success) {
			loadDiplomas();
		}
	});
}

function escapeHtml(text) {
	let div = document.createElement('div');
	div.textContent = text || '';
	return div.innerHTML;
}

loadDiplomas();
