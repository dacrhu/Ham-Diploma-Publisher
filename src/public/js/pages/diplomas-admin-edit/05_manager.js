// Selecting the diploma-level responsible manager — only from among users who
// ALREADY have the manager (or sa) permission (see schemas/users/users.js
// Users/Users query action — without 'q' it returns the current managers,
// accessible to any manager, not just a superadmin). This is only an
// admin-side "who to ask if there's a question about this diploma" info — it
// also shows up in the diploma list (see pages/diplomas-admin-list), it has no
// permission effect (it doesn't restrict who can edit the diploma itself).
const select_manager_id = document.getElementById('select_manager_id');

async function loadManagerOptions() {
	let response = await fetch('/api/admin/users');
	let json = await response.json();

	if (!json.success || !json.data) {
		return;
	}

	for (let i = 0, n = json.data.length; i < n; i++) {
		let u = json.data[i];
		let option = document.createElement('option');
		option.value = u._id;
		option.textContent = u.callsign ? `${u.callsign} (${u.email})` : u.email;
		select_manager_id.appendChild(option);
	}

	// See the comment on pendingManagerId (00_init.js) — if the diploma's data
	// already loaded before this list was built, we set the correct selection
	// here retroactively.
	if (pendingManagerId) {
		select_manager_id.value = pendingManagerId;
	}
}

loadManagerOptions();
