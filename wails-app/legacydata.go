package main

import (
	"io"
	"os"
	"path/filepath"
	"strings"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// legacyImportSkipMarker lives inside the sandboxed app's container home dir
// once the user has been asked about importing pre-sandbox data and
// declined, or the import itself completed — either way, don't nag on every
// subsequent launch. "Import Data from Previous Installation…" in the app
// menu (see menu.go) stays available regardless, so declining once never
// permanently blocks recovering the data later.
const legacyImportSkipMarker = ".sandbox-import-offered"

// legacyDBCompanionSuffixes are the SQLite side-files that can sit next to
// omnidb.db depending on journal mode — copied alongside it, when present,
// so an in-progress WAL isn't left behind.
var legacyDBCompanionSuffixes = []string{"", "-wal", "-shm", "-journal"}

// sandboxed reports whether this process is running under macOS App
// Sandbox. There's no public env var for this (verified by hand: launching
// a genuinely sandboxed, non-ad-hoc-signed build — confirmed sandboxed via
// `lsof -p <pid>`, which showed its cwd as
// /Users/x/Library/Containers/net.omnidb/Data — never had
// APP_SANDBOX_CONTAINER_ID set in its own environment at all, on this
// macOS version; an earlier version of this comment assumed otherwise and
// was wrong). What IS reliably true, and is the standard trick for
// detecting this: App Sandbox launches every process with its initial
// current directory set to its own container's Data dir, so checking that
// (captured once, before anything in this program might chdir elsewhere)
// works regardless of whether macOS ever documents/sets a dedicated env
// var for it. The Makefile's _build_mac target now always signs with the
// sandbox entitlements (see entitlements.plist), whether the resulting
// build ends up distributed via Homebrew/GitHub or, later, the Mac App
// Store — so this is true for every real packaged build. It's false in
// practice only when running the unsigned binary straight out of `wails
// dev`/`go run`, which is exactly when the migration flow below should
// stay out of the way.
var initialWorkingDir, _ = os.Getwd()

func sandboxed() bool {
	return strings.Contains(initialWorkingDir, "/Library/Containers/")
}

// maybeOfferLegacyDataImport is called once from startup(), before
// FrontendReady ever starts go-server (see app.go) — a successful import
// here means go-server opens the imported omnidb.db on its very first
// query, no restart needed. A no-op unless actually sandboxed (see
// sandboxed's comment) — App Sandbox redirects $HOME to a per-app container
// (see entitlements.plist's comment), which is the only reason a real
// install could ever lose sight of its own ~/.omnidb.
func (a *App) maybeOfferLegacyDataImport() {
	if !sandboxed() {
		return
	}

	home, err := appHomeDir()
	if err != nil {
		return
	}

	if _, err := os.Stat(filepath.Join(home, "omnidb.db")); err == nil {
		return // already has data — either migrated before or a genuinely new install with saved work already
	}
	if _, err := os.Stat(filepath.Join(home, legacyImportSkipMarker)); err == nil {
		return // already asked once; use the menu item to retry
	}

	answer, err := wailsruntime.MessageDialog(a.ctx, wailsruntime.MessageDialogOptions{
		Type:  wailsruntime.QuestionDialog,
		Title: "Import Previous OmniDB Data?",
		Message: "OmniDB now runs in a sandbox and can't automatically see " +
			"connections, snippets, or saved queries from an older OmniDB install.\n\n" +
			"If you've used OmniDB before, OmniDB can import that data now — you'll be asked to " +
			"locate your old \".omnidb\" folder (normally inside your home folder).",
		Buttons:       []string{"Import…", "Not Now"},
		DefaultButton: "Import…",
		CancelButton:  "Not Now",
	})
	_ = writeMarkerFile(filepath.Join(home, legacyImportSkipMarker))
	if err != nil || answer != "Import…" {
		return
	}

	a.importLegacyData(home, false)
}

// importLegacyData drives the "pick the old folder, copy omnidb.db over"
// flow — shared by maybeOfferLegacyDataImport's automatic offer and the
// menu's manual "Import Data from Previous Installation…" entry.
// alreadyRunning is true only for the manual/menu path, where go-server has
// already opened the (pre-import) database — the automatic startup path
// runs before that ever happens, so there's no live connection to race with
// there.
//
// alreadyRunning matters because copying over omnidb.db while go-server
// still has it open doesn't just risk losing later writes — omnidb-server
// keeps operating on its own (already-cached) view of the file, and can
// checkpoint that stale state right back over the just-copied bytes before
// the user gets around to restarting; confirmed by hand: exactly this
// happened, silently ending up with the original untouched database despite
// "Import Complete" the first time this shipped without a stop/start around
// the copy. Stopping and restarting the backend here removes the race
// (and the need to ask the user to restart manually) instead of leaving it
// as a footgun with a warning attached.
func (a *App) importLegacyData(home string, alreadyRunning bool) {
	// ShowHiddenFiles: the folder being sought is ~/.omnidb, a dot-directory
	// the native panel hides by default — without this, most users would
	// never find it (renaming/showing hidden files is not obvious).
	picked, err := wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title:           "Locate your previous .omnidb folder",
		ShowHiddenFiles: true,
	})
	if err != nil || picked == "" {
		return // cancelled — not an error, nothing to report
	}

	srcDir, ok := findLegacyAppDir(picked)
	if !ok {
		_, _ = wailsruntime.MessageDialog(a.ctx, wailsruntime.MessageDialogOptions{
			Type:    wailsruntime.WarningDialog,
			Title:   "No OmniDB Data Found",
			Message: "That folder doesn't look like an OmniDB data folder (no omnidb.db found in it, or in its omnidb-app/omnidb-server subfolder).",
		})
		return
	}

	if alreadyRunning {
		a.stopBackend()
	}

	copyErr := copyLegacyDB(srcDir, home)

	if alreadyRunning {
		go a.startBackend()
	}

	if copyErr != nil {
		_, _ = wailsruntime.MessageDialog(a.ctx, wailsruntime.MessageDialogOptions{
			Type:    wailsruntime.ErrorDialog,
			Title:   "Import Failed",
			Message: "Could not copy your previous data: " + copyErr.Error(),
		})
		return
	}

	_, _ = wailsruntime.MessageDialog(a.ctx, wailsruntime.MessageDialogOptions{
		Type:    wailsruntime.InfoDialog,
		Title:   "Import Complete",
		Message: "Your connections, snippets, and saved queries have been imported.",
	})
}

// findLegacyAppDir looks for omnidb.db directly inside picked, or inside the
// omnidb-app/omnidb-server subfolders a user might have picked the parent
// ".omnidb" folder for instead — covers both the desktop-app home dir
// (omnidb-app) and the classic server-mode one (omnidb-server), in case
// someone only ever ran `omnidb-server` directly before this app existed.
func findLegacyAppDir(picked string) (string, bool) {
	// omnidb-app/omnidb-server checked BEFORE picked itself: confirmed by
	// hand that some real installs have a stray, unrelated omnidb.db sitting
	// directly in ~/.omnidb (an old leftover, empty/wrong-schema) alongside
	// the real one in ~/.omnidb/omnidb-app — checking picked first matched
	// that stray file and stopped there, silently "importing" nothing every
	// time. The subfolders are also the more specific match whenever both
	// exist, which is exactly when this ordering matters.
	for _, candidate := range []string{
		filepath.Join(picked, "omnidb-app"),
		filepath.Join(picked, "omnidb-server"),
		picked,
	} {
		if _, err := os.Stat(filepath.Join(candidate, "omnidb.db")); err == nil {
			return candidate, true
		}
	}
	return "", false
}

// copyLegacyDB copies omnidb.db and any SQLite WAL/journal companions from
// srcDir into dstDir. Only these files — never the whole directory — since
// dstDir also holds a temp/ subfolder (go-server/appdb.go's resolveTempDir)
// that's purely ephemeral export scratch space, not user data.
func copyLegacyDB(srcDir, dstDir string) error {
	if err := os.MkdirAll(dstDir, 0o755); err != nil {
		return err
	}
	for _, suffix := range legacyDBCompanionSuffixes {
		name := "omnidb.db" + suffix
		src := filepath.Join(srcDir, name)
		if _, err := os.Stat(src); err != nil {
			continue // companion file not present — fine, WAL/journal are optional
		}
		if err := copyFile(src, filepath.Join(dstDir, name)); err != nil {
			return err
		}
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}

func writeMarkerFile(path string) error {
	return os.WriteFile(path, []byte("1"), 0o644)
}

// importLegacyDataFromMenu backs menu.go's "Import Data from Previous
// Installation…" item — always available, regardless of the automatic
// offer's marker file, so declining it once never permanently blocks
// recovering old data later. That menu item is only added when sandboxed()
// (see menu.go), since only App Sandbox can lose sight of pre-existing data
// in the first place (see sandboxed's comment).
func (a *App) importLegacyDataFromMenu() {
	home, err := appHomeDir()
	if err != nil {
		return
	}
	a.importLegacyData(home, true)
}
