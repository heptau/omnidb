import {
	Quit,
	WindowMinimise,
	WindowToggleMaximise,
	WindowMaximise,
} from '../wailsjs/runtime/runtime';

const loadingContainer = document.getElementById('loading_interface');
const barTop = document.getElementById('bar_top');
const view = document.getElementById('view');

document.getElementById('gui_close').addEventListener('click', () => Quit());
document.getElementById('gui_minimize').addEventListener('click', () => WindowMinimise());
document.getElementById('gui_fullscreen').addEventListener('click', () => WindowToggleMaximise());

loadingContainer.style.display = '';

// TEMPORARY placeholder transition for this step only — proves the frameless
// window, custom titlebar and iframe layout work. Replaced in the next step
// by real backend-readiness detection (omnidb-server startup instead of a timer).
setTimeout(() => {
	loadingContainer.style.display = 'none';
	WindowMaximise();
	barTop.style.display = '';
	view.style.display = '';
	view.src = 'about:blank';
}, 1500);
