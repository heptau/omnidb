// Rewrites the primary download CTA to the visitor's platform. The archive
// filenames carry no version (see Makefile/scripts/release.sh), so the
// releases/latest/download/<filename> URLs baked into the data-dl-* attributes
// below stay valid forever — no per-release update needed.
//
// Mac arm64 vs. Intel can't be told apart from user-agent: Safari/Chrome
// running under Rosetta on Apple Silicon still reports an Intel platform
// string. Default to arm64 (the common case on new Macs) and let the
// "Intel Mac?" fallback link handle the rest.
(function () {
	function detectOS() {
		var s = (navigator.userAgent || '') + ' ' + (navigator.platform || '');
		if (/Win/i.test(s)) return 'win';
		if (/Linux/i.test(s) && !/Android/i.test(s)) return 'linux';
		return 'mac';
	}

	var os = detectOS();

	// Only allow http(s) URLs through to `href` — guards against a
	// javascript:/data: URI ending up in a data-dl-* attribute and running
	// on click.
	function isSafeUrl(url) {
		try {
			var parsed = new URL(url, window.location.href);
			return parsed.protocol === 'https:' || parsed.protocol === 'http:';
		} catch (e) {
			return false;
		}
	}

	document.querySelectorAll('[data-dl-mac-arm]').forEach(function (el) {
		var url = el.getAttribute('data-dl-mac-arm');
		var label = el.getAttribute('data-label-mac');
		if (os === 'linux') {
			url = el.getAttribute('data-dl-linux');
			label = el.getAttribute('data-label-linux');
		} else if (os === 'win') {
			url = el.getAttribute('data-dl-win');
			label = el.getAttribute('data-label-win');
		}
		if (url && isSafeUrl(url)) el.setAttribute('href', url);
		if (label) el.textContent = label;
	});

	document.querySelectorAll('[data-intel-fallback]').forEach(function (el) {
		if (os === 'mac') el.classList.add('is-visible');
	});
})();
