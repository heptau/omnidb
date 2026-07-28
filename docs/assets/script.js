// Mobile sidebar toggle. This script tag sits at the very bottom of <body>,
// after the topbar/sidebar markup, so the elements below already exist by
// the time it runs — no DOMContentLoaded wrapper needed.
(function () {
	const menuToggle = document.getElementById('menuToggle');
	if (!menuToggle) return;

	// Scoped to ".docs-shell nav", not a bare "nav" selector — the shared
	// topbar also has a <nav class="site-topbar-links"> for its Docs/GitHub
	// links, and a bare selector would grab that one instead (it's first in
	// DOM order) rather than the sidebar this toggle is meant to control.
	const nav = document.querySelector('.docs-shell nav');
	const overlay = document.getElementById('menuOverlay');

	function toggleMenu() {
		const isOpen = nav.classList.contains('open');
		if (isOpen) {
			nav.classList.remove('open');
			overlay.classList.remove('open');
		} else {
			nav.classList.add('open');
			overlay.classList.add('open');
		}
	}

	menuToggle.addEventListener('click', toggleMenu);
	overlay.addEventListener('click', toggleMenu);
})();
