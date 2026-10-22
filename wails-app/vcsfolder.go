package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"

	"omnidb-server/vcsrepo"
)

// Version control of OmniDB's definitions (snippets, custom monitoring units,
// scheduled queries) -- the shell half of go-server/vcs.go. The sandboxed
// macOS build can only reach a folder its user picked in a native dialog,
// and the access that pick grants belongs to this process alone (the same
// reason .pgpass and ~/.aws are read here, not in go-server), so this process
// holds the repository folder and does all the file and git work in it --
// in-process, through vcsrepo, because a git child process would not
// necessarily carry the folder access along. go-server only turns
// definitions into files and back and sends them here.

// vcsDefaultFolderName is the repository folder used until the user picks
// another one: a directory inside the app's own home. The sandboxed macOS
// app may always create and use its own container, so versioning works there
// with no folder picker at all -- the picker is only for putting the
// repository somewhere the user's own git tools can reach (a container is
// hidden from other apps, a terminal included).
const vcsDefaultFolderName = "vcs"

// vcsFolderLocationFileName holds the chosen repository folder, in
// encodePgpassLocation's format.
const vcsFolderLocationFileName = "vcs-folder-bookmark.dat"

var vcsFolderAccess = &grantedLocationStore{fileName: vcsFolderLocationFileName}

// vcsRequest/vcsResponse mirror go-server/vcs.go's shellRequest/shellResponse.
type vcsRequest struct {
	Action  string         `json:"action"`
	Roots   []string       `json:"roots"`
	Files   []vcsrepo.File `json:"files"`
	Message string         `json:"message"`
}

type vcsResponse struct {
	Error     string         `json:"error,omitempty"`
	Cancelled bool           `json:"cancelled,omitempty"`
	Granted   bool           `json:"granted"`
	Default   bool           `json:"default,omitempty"`
	Path      string         `json:"path,omitempty"`
	State     *vcsrepo.State `json:"state,omitempty"`
	Result    string         `json:"result,omitempty"`
	Files     []vcsrepo.File `json:"files,omitempty"`
}

func (a *App) handleVCSRequest(w http.ResponseWriter, r *http.Request) {
	var req vcsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writePgpassJSON(w, vcsResponse{Error: err.Error()})
		return
	}
	switch req.Action {
	case "folder":
		dir, isDefault, err := vcsFolder()
		if err != nil {
			writePgpassJSON(w, vcsResponse{Error: err.Error()})
			return
		}
		writePgpassJSON(w, vcsResponse{Granted: true, Default: isDefault, Path: dir})
	case "choose":
		a.chooseVCSFolder(w)
	default:
		writePgpassJSON(w, runVCSAction(req))
	}
}

// chooseVCSFolder shows the native folder picker and remembers the pick for
// every later launch. A click always shows the picker, even with a folder
// already chosen -- it means the user wants to pick again.
func (a *App) chooseVCSFolder(w http.ResponseWriter) {
	path, bookmark, cancelled, err := pickVCSFolder(a.ctx)
	if err != nil {
		writePgpassJSON(w, vcsResponse{Error: err.Error()})
		return
	}
	if cancelled {
		writePgpassJSON(w, vcsResponse{Cancelled: true})
		return
	}
	if err := vcsFolderAccess.save(encodePgpassLocation(path, bookmark)); err != nil {
		writePgpassJSON(w, vcsResponse{Error: "Could not remember that folder: " + err.Error()})
		return
	}
	vcsFolderAccess.release()
	writePgpassJSON(w, vcsResponse{Granted: true, Path: path})
}

// vcsFolder is the folder to work in: the one the user picked, else the
// default one inside the app's home, created on first use.
func vcsFolder() (dir string, isDefault bool, err error) {
	if dir, ok := vcsFolderAccess.get(); ok {
		return dir, false, nil
	}
	home, err := appHomeDir()
	if err != nil {
		return "", false, err
	}
	dir = filepath.Join(home, vcsDefaultFolderName)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", false, err
	}
	return dir, true, nil
}

// runVCSAction performs a repository action in the chosen folder. A failure
// gets one retry through a freshly-resolved grant, like readGrantedPassfile:
// a bookmark resolved earlier this launch can stop working while the app runs.
func runVCSAction(req vcsRequest) vcsResponse {
	dir, isDefault, err := vcsFolder()
	if err != nil {
		return vcsResponse{Error: err.Error()}
	}
	resp, err := doVCSAction(dir, req)
	if err != nil && !isDefault {
		vcsFolderAccess.release()
		if dir2, ok := vcsFolderAccess.get(); ok {
			resp, err = doVCSAction(dir2, req)
		}
	}
	if err != nil {
		return vcsResponse{Granted: true, Error: err.Error()}
	}
	resp.Granted = true
	resp.Default = isDefault
	return resp
}

func doVCSAction(dir string, req vcsRequest) (vcsResponse, error) {
	if err := vcsrepo.CheckDir(dir); err != nil {
		return vcsResponse{}, err
	}
	switch req.Action {
	case "status":
		st := vcsrepo.Status(dir)
		return vcsResponse{State: &st}, nil
	case "init":
		if err := vcsrepo.Init(dir); err != nil {
			return vcsResponse{}, err
		}
		st := vcsrepo.Status(dir)
		return vcsResponse{State: &st}, nil
	case "commit":
		result, err := vcsrepo.Commit(dir, req.Roots, req.Files, req.Message)
		return vcsResponse{Result: result}, err
	case "read":
		files, err := vcsrepo.Read(dir, req.Roots)
		return vcsResponse{Files: files}, err
	}
	return vcsResponse{}, errors.New("unknown action")
}
