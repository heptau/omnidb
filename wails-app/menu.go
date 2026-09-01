package main

import (
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// buildMenu constructs the native menu bar. Everything except Quit and the
// two "open in browser" Help items runs a snippet of JS directly in
// whatever page is currently loaded (workspace.html — see AGENTS.md's
// "Wails migration" notes on why there's no persistent chrome of our own),
// via WindowExecJS — calling the same existing jQuery functions the
// in-page toolbar already uses, no frontend UI duplicated here.
//
// This used to go through wailsruntime.EventsEmit + a window.runtime.EventsOn
// listener in the page (see git history for wails_menu_bridge.js), which
// silently never fired in the actual packaged app. Root cause, confirmed by
// reading Wails' own source (pkg/assetserver/assetserver.go): window.runtime
// is only ever injected into pages served through Wails' OWN asset server —
// it intercepts requests for /wails/runtime.js and /wails/ipc.js and rewrites
// HTML responses it serves to include them. workspace.html is served by
// go-server, a completely separate net/http server in its own process, which
// the webview reaches via a full top-level window.location.href navigation
// (main.js) — Wails has no involvement in that request at all, so
// window.runtime never exists there. WindowExecJS sidesteps this entirely:
// it's a raw "evaluate this JS in the current page" primitive at the native
// webview layer (evaluateJavaScript: on macOS), independent of any
// JS-side bootstrap — the only thing that can actually reach a page loaded
// this way.
//
// Not using menu.AppMenu()'s native macOS role deliberately: it bundles its
// own non-overridable "About"/"Quit"/"Hide"/Services block, which would have
// meant a generic native About panel instead of the app's own one, and no
// way to put a "Settings" entry next to it. Trade-off: no native Hide/Services
// entries on macOS. Edit/Window still use their native roles below, since
// those don't have that conflict.
func (a *App) buildMenu() *menu.Menu {
	appMenu := menu.NewMenu()
	appMenu.AddText("About OmniDB", nil, a.execJS("showAbout()"))
	appMenu.AddText("Settings...", keys.CmdOrCtrl(","), a.execJS("showConfigUser()"))
	appMenu.AddSeparator()
	appMenu.AddText("Quit OmniDB", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
		wailsruntime.Quit(a.ctx)
	})

	// Every accelerator below is Cmd/Ctrl+Shift+<letter>, not plain
	// Cmd/Ctrl+<letter>: the frontend's own shortcuts.js already uses plain
	// Ctrl+<letter> (mac) / Alt+<letter> (Windows/Linux) for its own bindings
	// (Run Query, Indent, ...), and plain Cmd+<letter> already means
	// something fixed system-wide (Cmd+C copy, Cmd+S save, Cmd+M minimize) —
	// overriding those natively would be surprising. Shift avoids both.
	// Same order as the vertical section-nav rail (section_switcher.js):
	// Welcome, Connections, Snippets, Database.
	viewMenu := menu.NewMenu()
	viewMenu.AddText("Welcome", keys.Combo("w", keys.CmdOrCtrlKey, keys.ShiftKey), a.execJS("switchSection('welcome')"))
	viewMenu.AddText("Connections", keys.Combo("c", keys.CmdOrCtrlKey, keys.ShiftKey), a.execJS("startConnectionManagement()"))
	viewMenu.AddText("Snippets", keys.Combo("s", keys.CmdOrCtrlKey, keys.ShiftKey), a.execJS("toggleSnippetPanel()"))
	viewMenu.AddText("Database", keys.Combo("d", keys.CmdOrCtrlKey, keys.ShiftKey), a.execJS("switchSection('database')"))
	viewMenu.AddSeparator()
	viewMenu.AddText("Toggle Database Tree", keys.CmdOrCtrl("b"), a.execJS("toggleTreeContainer()"))
	viewMenu.AddText("Toggle Properties/DDL Panel", keys.Combo("b", keys.CmdOrCtrlKey, keys.ShiftKey), a.execJS(
		`if (v_connTabControl.selectedTab) {`+
			`var id = v_connTabControl.selectedTab.id;`+
			`toggleTreeTabsContainer('tree_tabs_parent_' + id, id + '_left_resize_line_horizontal');`+
			`}`,
	))

	helpMenu := menu.NewMenu()
	helpMenu.AddText("Getting Started", nil, a.execJS(`startTutorial('getting_started')`))
	helpMenu.AddText("Keyboard Shortcuts", nil, a.execJS(
		`showConfigUser(); $('a[href="#config_shortcuts"]').trigger('click');`,
	))
	helpMenu.AddSeparator()
	helpMenu.AddText("Visit omnidb.net", nil, func(_ *menu.CallbackData) {
		wailsruntime.BrowserOpenURL(a.ctx, "https://www.omnidb.net")
	})
	helpMenu.AddText("GitHub Repository", nil, func(_ *menu.CallbackData) {
		wailsruntime.BrowserOpenURL(a.ctx, "https://github.com/heptau/omnidb")
	})

	m := menu.NewMenu()
	m.Append(menu.SubMenu("OmniDB", appMenu))
	m.Append(menu.EditMenu())
	m.Append(menu.SubMenu("View", viewMenu))
	m.Append(menu.WindowMenu())
	m.Append(menu.SubMenu("Help", helpMenu))
	return m
}

// execJS runs js in whatever page is currently loaded — a no-op (harmless
// JS ReferenceError, invisible to the user) if that's still the loading
// screen rather than workspace.html, same as the old event-based approach's
// intended fallback, just via a different failure mode.
func (a *App) execJS(js string) menu.Callback {
	return func(_ *menu.CallbackData) {
		wailsruntime.WindowExecJS(a.ctx, js)
	}
}
