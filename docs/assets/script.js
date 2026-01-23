document.addEventListener('DOMContentLoaded', function () {
	const menuToggle = document.getElementById('menuToggle');
	const nav = document.querySelector('nav');
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
});
