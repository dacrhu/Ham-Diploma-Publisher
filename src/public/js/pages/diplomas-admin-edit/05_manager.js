// Diploma-szintű felelős manager kiválasztása — csak a MÁR manager (vagy sa)
// jogosultsággal rendelkező felhasználók közül (lásd schemas/users/users.js
// Users/Users query action — 'q' nélkül a jelenlegi managereket adja vissza,
// bármely managernek elérhető, nem csak superadminnak). Ez csak egy admin-oldali
// "kit kell keresni, ha kérdés van ezzel a diplomával kapcsolatban" infó — a
// diploma-listán is megjelenik (lásd pages/diplomas-admin-list), nincs
// jogosultsági hatása (nem szűkíti, ki szerkesztheti magát a diplomát).
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

	// Lásd a pendingManagerId kommentjét (00_init.js) — ha a diploma adatai már
	// betöltődtek, mielőtt ez a lista elkészült, itt állítjuk be utólag a helyes
	// kiválasztást.
	if (pendingManagerId) {
		select_manager_id.value = pendingManagerId;
	}
}

loadManagerOptions();
