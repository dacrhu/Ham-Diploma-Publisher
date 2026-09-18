// Cookie consent banner (loaded on every page, by layout.html) — we record
// consent in localStorage (no need for server-side state); we don't use
// feEventId, because the layout does NOT guarantee frontendhelper.js is
// loaded on every page (e.g. views/contacts.html doesn't import anything).
(function () {
	var STORAGE_KEY = 'hdp_cookie_consent';
	var banner = document.getElementById('cookie_banner');

	if (!banner) {
		return;
	}

	var consented = false;

	try {
		consented = localStorage.getItem(STORAGE_KEY) === '1';
	} catch (e) {
		consented = false;
	}

	if (consented) {
		return;
	}

	banner.classList.remove('is-hidden');

	var button = document.getElementById('button_cookie_accept');
	button.addEventListener('click', function () {
		try {
			localStorage.setItem(STORAGE_KEY, '1');
		} catch (e) {
			// no-op
		}
		banner.classList.add('is-hidden');
	});
})();
