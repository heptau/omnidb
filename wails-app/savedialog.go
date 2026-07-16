package main

import (
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// saveDialogRequest/Response mirror go-server/export_save_dialog.go's relay
// payload — kept as their own pair here since nothing else needs these
// types.
type saveDialogRequest struct {
	SrcPath       string `json:"srcPath"`
	SuggestedName string `json:"suggestedName"`
}

type saveDialogResponse struct {
	Path  string `json:"path"`
	Error string `json:"error"`
}

// startSaveDialogServer runs a tiny loopback-only HTTP server that lets
// go-server ask this process to show a native "Save As" dialog and copy a
// file there on its behalf. This exists only because of a Wails
// limitation: window.go/window.runtime are injected exclusively into pages
// served by Wails' own asset server (see pkg/assetserver/assetserver.go);
// workspace.html is served entirely by go-server via a full top-level
// navigation (see AGENTS.md's "Wails migration" notes and menu.go's execJS
// switch, which hit the exact same limitation from the other direction),
// so it never gets that bridge and can never call a bound Go method
// directly — this HTTP hop is the only way for it to reach this process at
// all. Loopback-only binding is the same trust boundary go-server's own
// /internal/shutdown/ relies on (see its comment) — no separate auth token
// needed on top of that.
func (a *App) startSaveDialogServer() error {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/save-file", a.handleSaveDialogRequest)

	server := &http.Server{Handler: mux}
	a.saveDialogAddr = listener.Addr().String()
	go server.Serve(listener)
	return nil
}

func (a *App) handleSaveDialogRequest(w http.ResponseWriter, r *http.Request) {
	var req saveDialogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeSaveDialogError(w, err.Error())
		return
	}

	dst, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		DefaultFilename: req.SuggestedName,
		Title:           "Save Exported File",
	})
	if err != nil {
		writeSaveDialogError(w, err.Error())
		return
	}
	if dst == "" {
		// User cancelled the dialog — not an error.
		writeSaveDialogJSON(w, saveDialogResponse{})
		return
	}

	if err := copySaveDialogFile(req.SrcPath, dst); err != nil {
		writeSaveDialogError(w, err.Error())
		return
	}
	writeSaveDialogJSON(w, saveDialogResponse{Path: dst})
}

func copySaveDialogFile(srcPath, dstPath string) error {
	src, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer src.Close()

	out, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, src)
	return err
}

func writeSaveDialogError(w http.ResponseWriter, msg string) {
	writeSaveDialogJSON(w, saveDialogResponse{Error: msg})
}

func writeSaveDialogJSON(w http.ResponseWriter, resp saveDialogResponse) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
