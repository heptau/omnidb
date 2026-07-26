// OmniDB theme switcher — Auto / Light / Dark.
// "Auto" means no data-theme attribute at all, so the prefers-color-scheme
// media queries in topbar.css/style.css/style.css (landing) decide. Any
// explicit choice is stored so it survives navigation between pages.
(function () {
	var STORAGE_KEY = 'omnidb_theme';
	var root = document.documentElement;

	function apply(value) {
		if (value === 'light' || value === 'dark') {
			root.setAttribute('data-theme', value);
		} else {
			root.removeAttribute('data-theme');
		}
	}

	function getStored() {
		try {
			return localStorage.getItem(STORAGE_KEY) || 'auto';
		} catch (e) {
			return 'auto';
		}
	}

	function setStored(value) {
		try {
			localStorage.setItem(STORAGE_KEY, value);
		} catch (e) {
			/* private browsing / storage disabled — theme just won't persist */
		}
	}

	// Apply as early as possible to avoid a flash of the wrong theme.
	apply(getStored());

	document.addEventListener('DOMContentLoaded', function () {
		var current = getStored();
		var dropdown = document.querySelector('[data-dropdown="theme"]');
		if (!dropdown) return;

		var options = dropdown.querySelectorAll('.dropdown-option');
		options.forEach(function (option) {
			if (option.getAttribute('data-theme-value') === current) {
				option.classList.add('active');
			} else {
				option.classList.remove('active');
			}
			option.addEventListener('click', function () {
				var value = option.getAttribute('data-theme-value');
				setStored(value);
				apply(value);
				options.forEach(function (o) {
					o.classList.toggle('active', o === option);
				});
				window.omnidbCloseDropdowns && window.omnidbCloseDropdowns();
			});
		});
	});
})();
