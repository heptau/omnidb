package main

import (
	"net/http"
	"net/url"
)

// Plugin routes are intentionally native no-op stubs, not ports —
// plugins.py's dynamic importlib-based plugin loading (dynamic import of a
// user-supplied plugin.py, invoked via getattr) was decided against for the
// Go backend project-wide (see the plan file's plugin note); the Go static
// asset embed also never included OmniDB_app/static/plugins (see
// static_assets.go). Since no plugins are ever loaded, Django's own real
// behavior for every one of these routes today is already just "the empty
// case" — these mirror that exactly rather than approximating it, so the
// frontend's Plugins dialog (still reachable from the utilities menu)
// renders correctly empty instead of erroring once Django is gone.
const pluginsNotSupportedMessage = "Plugins are not supported in this build."

// handleGetPlugins mirrors plugins.py's get_plugins — always an empty list
// today since the `plugins` dict it reads is only ever populated by
// load_plugins() scanning a plugins directory this build never ships.
func handleGetPlugins(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		who, err := resolveIdentity(upstream, r.Header.Get("Cookie"))
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}
		writeEnvelope(w, []map[string]any{}, false, -1)
	}
}

// handleListPlugins mirrors plugins.py's list_plugins — same empty-dict
// reasoning as handleGetPlugins, but also covers failed_plugins (also
// always empty).
func handleListPlugins(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		who, err := resolveIdentity(upstream, r.Header.Get("Cookie"))
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}
		writeEnvelope(w, map[string]any{
			"list":    []any{},
			"message": []any{},
		}, false, -1)
	}
}

// handleReloadPlugins mirrors plugins.py's reload_plugins — Python's
// load_plugins() always trivially succeeds when scanning an empty/missing
// plugins directory, so this just returns the same v_data: true.
func handleReloadPlugins(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		who, err := resolveIdentity(upstream, r.Header.Get("Cookie"))
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}
		writeEnvelope(w, true, false, -1)
	}
}

// handleDeletePlugin mirrors plugins.py's delete_plugin — every lookup in
// Python's version is wrapped in a silently-ignored try/except, so it
// always reaches the same generic success message regardless of whether
// anything was actually found to delete; matched here directly rather than
// replicating the always-no-op lookups. Superuser-only, matching Python's
// v_session.v_super_user check.
func handleDeletePlugin(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireSuperuser(w, r, upstream); !ok {
			return
		}
		writeEnvelope(w, "Please restart OmniDB to unload plugin libraries.", false, -1)
	}
}

// handlePluginsNotSupported mirrors plugins.py's exec_plugin_function and
// upload_view (the /upload/ route) — unlike the read-only routes above,
// these would need a real plugin (or a real uploaded file) to do anything
// meaningful; since none can ever exist in this build, a graceful "not
// supported" error is more honest than a fabricated success.
func handlePluginsNotSupported() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeEnvelope(w, pluginsNotSupportedMessage, true, -1)
	}
}
