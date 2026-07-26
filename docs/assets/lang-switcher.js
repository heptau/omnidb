// OmniDB language switcher.
//
// i18n scaffold note: only English content exists today. The other six
// languages are listed with enabled:false ("Soon" badge, disabled button —
// see topbar.css's .dropdown-option:disabled/.dropdown-option-soon) purely
// so the UI already communicates the plan; no docs/<code>/ directory is
// created until a real translation lands, to avoid thin/duplicate content.
//
// To add a language once it's translated:
//   1. Duplicate docs/en/ into docs/<code>/, translate its contents.
//   2. Flip that language's `enabled` to true below.
//   3. Add its hreflang alternates + sitemap.xml entries.
// Nothing else needs to change here — navigation for enabled languages is
// computed generically by swapping the leading /<lang>/ path segment.
var OMNIDB_LANGUAGES = [
	{ code: 'en', label: 'English', flag: '🇬🇧', enabled: true },
	{ code: 'cs', label: 'Čeština', flag: '🇨🇿', enabled: false },
	{ code: 'de', label: 'Deutsch', flag: '🇩🇪', enabled: false },
	{ code: 'es', label: 'Español', flag: '🇪🇸', enabled: false },
	{ code: 'fr', label: 'Français', flag: '🇫🇷', enabled: false },
	{ code: 'it', label: 'Italiano', flag: '🇮🇹', enabled: false },
	{ code: 'pt', label: 'Português', flag: '🇵🇹', enabled: false }
];

(function () {
	function targetUrlFor(code) {
		var path = window.location.pathname;
		var match = path.match(/\/([a-z]{2})\/(.*)$/);
		if (!match) return null;
		return path.replace('/' + match[1] + '/', '/' + code + '/');
	}

	document.addEventListener('DOMContentLoaded', function () {
		var dropdown = document.querySelector('[data-dropdown="lang"]');
		if (!dropdown) return;

		var currentLang = document.documentElement.lang || 'en';
		var options = dropdown.querySelectorAll('.dropdown-option');
		options.forEach(function (option) {
			var code = option.getAttribute('data-lang-value');
			option.classList.toggle('active', code === currentLang);
			if (option.disabled) return;
			option.addEventListener('click', function () {
				if (code === currentLang) {
					window.omnidbCloseDropdowns && window.omnidbCloseDropdowns();
					return;
				}
				var target = targetUrlFor(code);
				if (target) window.location.href = target;
			});
		});
	});
})();
