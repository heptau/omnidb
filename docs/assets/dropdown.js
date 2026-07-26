// Generic open/close behavior shared by the language and theme dropdowns
// in the site topbar. Each dropdown is a `.dropdown[data-dropdown]` wrapping
// a `.dropdown-trigger` button and a `.dropdown-menu`.
(function () {
	function closeAll(except) {
		document.querySelectorAll('.dropdown.open').forEach(function (d) {
			if (d !== except) {
				d.classList.remove('open');
				var trigger = d.querySelector('.dropdown-trigger');
				if (trigger) trigger.setAttribute('aria-expanded', 'false');
			}
		});
	}

	window.omnidbCloseDropdowns = closeAll;

	document.addEventListener('DOMContentLoaded', function () {
		document.querySelectorAll('.dropdown').forEach(function (dropdown) {
			var trigger = dropdown.querySelector('.dropdown-trigger');
			if (!trigger) return;
			trigger.addEventListener('click', function (e) {
				e.stopPropagation();
				var isOpen = dropdown.classList.contains('open');
				closeAll(isOpen ? null : dropdown);
				dropdown.classList.toggle('open', !isOpen);
				trigger.setAttribute('aria-expanded', String(!isOpen));
			});
		});

		document.addEventListener('click', function () {
			closeAll();
		});

		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape') closeAll();
		});
	});
})();
