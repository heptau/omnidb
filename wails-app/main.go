package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "OmniDB",
		Width:  600,
		Height: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 242, G: 242, B: 242, A: 255},
		Menu:             app.buildMenu(),
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		// Wails only wires up the green traffic-light zoom button (and its
		// hover menu for tiling left/right) when Mac options are non-nil --
		// window.go's CreateWindow leaves `zoomable` at its C.int zero value
		// (false) otherwise, and WailsContext.m disables the button whenever
		// !zoomable. An empty *mac.Options is enough: DisableZoom's zero
		// value is already false.
		Mac: &mac.Options{},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
