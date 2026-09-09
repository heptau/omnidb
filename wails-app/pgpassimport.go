package main

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgpassfile"
)

// pgpassEntryDTO is one .pgpass line, stripped of its password — see
// handlePgpassImportRequest's comment on why a password never crosses this
// relay for an import.
type pgpassEntryDTO struct {
	Hostname string `json:"hostname"`
	Port     string `json:"port"`
	Database string `json:"database"`
	Username string `json:"username"`
}

type pgpassImportResponse struct {
	Entries   []pgpassEntryDTO `json:"entries"`
	Cancelled bool             `json:"cancelled"`
	Error     string           `json:"error"`
}

// handlePgpassImportRequest backs connections.js's "Import from .pgpass"
// button (desktop mode only — see go-server/pgpass_import.go's comment on
// the non-desktop fallback): shows the native Open dialog, then hands back
// every entry in the picked file as a host/port/database/username
// quadruple, with no password attached. connections.js turns each into a
// saved connection with a bare `postgresql://user@host:port/db` connection
// string and no stored password — the whole point of importing from
// .pgpass in the first place is to keep relying on that file for
// authentication (resolved at connect time, see pgpassdialog.go's
// handlePgpassResolveRequest) rather than copying passwords into OmniDB's
// own database, so this relay never sends one across in the first place.
//
// Picking a file here also grants access to it for good, exactly as
// handlePgpassGrantRequest does (same saved location, see
// writePgpassLocationFile): importing connections out of a .pgpass file and
// then having every one of them authenticate from that same file is the
// whole point, so there is no reason to make the user pick it a second time
// from the password prompt.
func (a *App) handlePgpassImportRequest(w http.ResponseWriter, r *http.Request) {
	path, bookmark, cancelled, err := pickPgpassFile(a.ctx)
	if err != nil {
		writePgpassImportError(w, err.Error())
		return
	}
	if cancelled {
		writePgpassImportJSON(w, pgpassImportResponse{Cancelled: true})
		return
	}
	passfile, err := pgpassfile.ReadPassfile(path)
	if err != nil {
		writePgpassImportError(w, "Could not read that file: "+err.Error())
		return
	}
	// Best-effort: a location that can't be persisted only costs the user
	// one Open panel later, from the password prompt's own grant button —
	// it must not fail an import that otherwise succeeded.
	if err := writePgpassLocationFile(encodePgpassLocation(path, bookmark)); err == nil {
		releasePgpassAccess()
	}
	writePgpassImportJSON(w, pgpassImportResponse{Entries: pgpassEntriesToDTOs(passfile.Entries)})
}

// pgpassEntriesToDTOs strips passwords and skips wildcard lines ("*" in
// any field) — a wildcard entry describes "any host"/"any port"/etc.
// rather than one concrete database to connect to, so it has no single
// host/port/database/username quadruple a saved connection could use.
func pgpassEntriesToDTOs(entries []*pgpassfile.Entry) []pgpassEntryDTO {
	dtos := make([]pgpassEntryDTO, 0, len(entries))
	for _, e := range entries {
		if e.Hostname == "*" || e.Port == "*" || e.Database == "*" || e.Username == "*" {
			continue
		}
		dtos = append(dtos, pgpassEntryDTO{Hostname: e.Hostname, Port: e.Port, Database: e.Database, Username: e.Username})
	}
	return dtos
}

func writePgpassImportError(w http.ResponseWriter, msg string) {
	writePgpassImportJSON(w, pgpassImportResponse{Error: msg})
}

func writePgpassImportJSON(w http.ResponseWriter, resp pgpassImportResponse) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
