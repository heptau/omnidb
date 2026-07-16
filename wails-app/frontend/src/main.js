import { WindowMaximise, EventsOn } from '../wailsjs/runtime/runtime';
import { FrontendReady } from '../wailsjs/go/main/App';

const loadingContainer = document.getElementById('loading_interface');
const loadingLog = document.getElementById('loading');
const loginWrapBody = document.getElementById('login_wrap_body');

loadingContainer.style.display = '';

EventsOn('backend:log', (line) => {
	loadingLog.innerHTML += line + '<br/>';
	loginWrapBody.scrollTo(0, 99999);
});

// Full top-level navigation, not an <iframe>: WKWebView treats iframed
// content as third-party and silently drops the login session cookie
// (verified — Django's redirect chain succeeds server-side, but the cookie
// never survives the next request). Navigating the whole window avoids that
// entirely, at the cost of the custom frameless titlebar the NW.js shell
// had — see main.go, which uses the native window frame instead.
EventsOn('backend:ready', (url) => {
	WindowMaximise();
	// location.replace(), not .href =: a plain assignment pushes a new
	// history entry, leaving this loading page one "back" navigation away.
	// WKWebView treats an unhandled Backspace/Delete keypress (e.g. the
	// native Edit menu's Delete item, which — like every Mac app's Edit
	// menu — is bound to the bare key with no modifier) as "go back" when
	// focus isn't in an editable field, which would land the user right
	// back on this screen. replace() leaves no history entry to go back to.
	window.location.replace(url);
});

// Tell Go it's safe to start the backend and start emitting events — only
// after the listeners above are registered. See FrontendReady's comment in
// app.go for why this handshake exists instead of starting from Go's own
// OnStartup/OnDomReady lifecycle hooks.
FrontendReady();
