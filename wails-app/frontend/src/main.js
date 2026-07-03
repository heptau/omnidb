import {
	Quit,
	WindowMinimise,
	WindowToggleMaximise,
	WindowMaximise,
	EventsOn,
} from '../wailsjs/runtime/runtime';

const loadingContainer = document.getElementById('loading_interface');
const loadingLog = document.getElementById('loading');
const loginWrapBody = document.getElementById('login_wrap_body');
const barTop = document.getElementById('bar_top');
const view = document.getElementById('view');

document.getElementById('gui_close').addEventListener('click', () => Quit());
document.getElementById('gui_minimize').addEventListener('click', () => WindowMinimise());
document.getElementById('gui_fullscreen').addEventListener('click', () => WindowToggleMaximise());

loadingContainer.style.display = '';

EventsOn('backend:log', (line) => {
	loadingLog.innerHTML += line + '<br/>';
	loginWrapBody.scrollTo(0, 99999);
});

EventsOn('backend:ready', (url) => {
	loadingContainer.style.display = 'none';
	WindowMaximise();
	barTop.style.display = '';
	view.style.display = '';
	view.src = url;
});
