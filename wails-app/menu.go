package main

import (
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// buildMenu constructs the native menu bar. Everything except Quit and the
// two "open in browser" Help items just tells the currently loaded page
// (workspace.html — see AGENTS.md's "Wails migration" notes on why there's
// no persistent chrome of our own) to run one of its existing jQuery
// functions, via a "menu:<name>" event — see
// go-server/static_assets/OmniDB_app/js/wails_menu_bridge.js for the
// listener side. Those functions already exist and are reused as-is, no
// frontend UI was duplicated here.
//
// Not using menu.AppMenu()'s native macOS role deliberately: it bundles its
// own non-overridable "About"/"Quit"/"Hide"/Services block, which would have
// meant a generic native About panel instead of the app's own one, and no
// way to put a "Settings" entry next to it. Trade-off: no native Hide/Services
// entries on macOS. Edit/Window still use their native roles below, since
// those don't have that conflict.
func (a *App) buildMenu() *menu.Menu {
	appMenu := menu.NewMenu()
	appMenu.AddText("About OmniDB", nil, a.emitMenuEvent("menu:about"))
	appMenu.AddText("Settings...", keys.CmdOrCtrl(","), a.emitMenuEvent("menu:settings"))
	appMenu.AddSeparator()
	appMenu.AddText("Quit OmniDB", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
		wailsruntime.Quit(a.ctx)
	})

	viewMenu := menu.NewMenu()
	viewMenu.AddText("Connections", nil, a.emitMenuEvent("menu:connections"))
	viewMenu.AddText("Snippets", nil, a.emitMenuEvent("menu:snippets"))
	viewMenu.AddText("Plugins", nil, a.emitMenuEvent("menu:plugins"))
	viewMenu.AddSeparator()
	viewMenu.AddText("Switch Menu", nil, a.emitMenuEvent("menu:switch-menu"))
	viewMenu.AddSeparator()
	viewMenu.AddText("Toggle Database Tree", keys.CmdOrCtrl("b"), a.emitMenuEvent("menu:toggle-tree"))
	viewMenu.AddText("Toggle Properties/DDL Panel", keys.Combo("b", keys.CmdOrCtrlKey, keys.ShiftKey), a.emitMenuEvent("menu:toggle-tree-tabs"))

	helpMenu := menu.NewMenu()
	helpMenu.AddText("Getting Started", nil, a.emitMenuEvent("menu:getting-started"))
	helpMenu.AddText("Keyboard Shortcuts", nil, a.emitMenuEvent("menu:shortcuts"))
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

// emitMenuEvent tells whatever page is currently loaded (see buildMenu's
// comment) that this menu item was clicked. A no-op if the page isn't
// listening — e.g. still on the loading screen, or workspace.html hasn't
// loaded the bridge script for some reason.
func (a *App) emitMenuEvent(name string) menu.Callback {
	return func(_ *menu.CallbackData) {
		wailsruntime.EventsEmit(a.ctx, name)
	}
}
