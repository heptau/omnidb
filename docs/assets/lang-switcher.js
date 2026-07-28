// OmniDB language switcher.
var OMNIDB_LANGUAGES = [
	{ code: 'en', label: 'English', flag: '🇬🇧', enabled: true },
	{ code: 'cs', label: 'Čeština', flag: '🇨🇿', enabled: true },
	{ code: 'de', label: 'Deutsch', flag: '🇩🇪', enabled: true },
	{ code: 'es', label: 'Español', flag: '🇪🇸', enabled: true },
	{ code: 'fr', label: 'Français', flag: '🇫🇷', enabled: true },
	{ code: 'it', label: 'Italiano', flag: '🇮🇹', enabled: true },
	{ code: 'pt', label: 'Português', flag: '🇵🇹', enabled: true }
];

(function () {
	function targetUrlFor(code) {
		var path = window.location.pathname;
		var currentLang = document.documentElement.lang || 'en';
		var regex = new RegExp('/' + currentLang + '(/|$)');
		var url = path.replace(regex, '/' + code + '/');
		return url === path ? null : url;
	}

	var STORAGE_KEY = 'omnidb_lang';
	var SUPPORTED = ['en', 'cs', 'de', 'es', 'fr', 'it', 'pt'];

	document.addEventListener('DOMContentLoaded', function () {
		var dropdown = document.querySelector('[data-dropdown="lang"]');
		if (!dropdown) return;

		var currentLang = document.documentElement.lang || 'en';
		var stored;
		try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
		var isAuto = !stored || stored === 'auto';

		var options = dropdown.querySelectorAll('.dropdown-option');
		options.forEach(function (option) {
			var code = option.getAttribute('data-lang-value');
			if (code === 'auto') {
				option.classList.toggle('active', isAuto);
			} else {
				option.classList.toggle('active', code === currentLang && !isAuto);
			}
			if (option.disabled) return;
			option.addEventListener('click', function (e) {
		if (code === 'auto') {
				// Switch to auto-detect
				try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
				var userLangs = navigator.languages || [navigator.language || navigator.userLanguage];
				var detected = 'en';
				for (var i = 0; i < userLangs.length; i++) {
					if (!userLangs[i]) continue;
					var c = userLangs[i].substring(0, 2).toLowerCase();
					if (SUPPORTED.indexOf(c) !== -1) { detected = c; break; }
				}
				var target = targetUrlFor(detected);
				if (target) window.location.href = target;
				return;
			}
				if (code === currentLang) {
					window.omnidbCloseDropdowns && window.omnidbCloseDropdowns();
					return;
				}
				try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* ignore */ }
				var target = targetUrlFor(code);
				if (target) window.location.href = target;
			});
		});
	});
})();
