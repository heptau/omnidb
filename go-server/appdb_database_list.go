package main

import (
	"database/sql"
	"strings"
)

// consoleHelpForTechnology mirrors each OmniDatabase subclass's
// v_console_help constant — identical across every engine except SQLite.
func consoleHelpForTechnology(technology string) string {
	if technology == "sqlite" {
		return "Console tab."
	}
	return `Console tab. Type the commands in the editor below this box. \? to view command list.`
}

// printDatabaseInfo mirrors each engine's PrintDatabaseInfo() — SQLite shows
// just the file's basename, everything else shows "user@database".
func printDatabaseInfo(c appConnection) string {
	if c.Technology == "sqlite" {
		parts := strings.Split(c.Database, "/")
		return parts[len(parts)-1]
	}
	return c.Username + "@" + c.Database
}

// printDatabaseDetails mirrors each engine's PrintDatabaseDetails() —
// SQLite is always "Local File", everything else is "server:port".
func printDatabaseDetails(c appConnection) string {
	if c.Technology == "sqlite" {
		return "Local File"
	}
	return c.Server + ":" + c.Port
}

type databaseListEntry struct {
	DBType      string
	Alias       string
	ConnID      int64
	ConsoleHelp string
	Database    string
	ConnString  string
	Details1    string
	Details2    string
	Public      bool
}

type remoteTerminalEntry struct {
	ConnID  int64
	Alias   string
	Details string
	Public  bool
}

// buildDatabaseList mirrors get_database_list's two parallel loops over
// v_session.v_databases — a "terminal" connection (or one with SSH
// tunneling enabled) shows up in remoteTerminals; every *non*-terminal
// connection also shows up in databases (terminal connections have no live
// 'database' object in Python at all — OmniDatabase.Generic.InstantiateDatabase
// has no 'terminal' branch and implicitly returns None for it, which is
// exactly the check `v_database_object['database'] != None` guards against).
func buildDatabaseList(conns []appConnection) (databases []databaseListEntry, terminals []remoteTerminalEntry) {
	for _, c := range conns {
		if c.UseTunnel || c.Technology == "terminal" {
			terminals = append(terminals, remoteTerminalEntry{
				ConnID:  c.ID,
				Alias:   c.Alias,
				Details: c.SSHUser + "@" + c.SSHServer + ":" + c.SSHPort,
				Public:  c.Public,
			})
		}
		if c.Technology == "terminal" {
			continue
		}

		details2 := printDatabaseDetails(c)
		if c.UseTunnel {
			details2 += " <b>(" + c.SSHServer + ":" + c.SSHPort + ")</b>"
		}
		databases = append(databases, databaseListEntry{
			DBType:      c.Technology,
			Alias:       c.Alias,
			ConnID:      c.ID,
			ConsoleHelp: consoleHelpForTechnology(c.Technology),
			Database:    c.Database,
			ConnString:  c.ConnString,
			Details1:    printDatabaseInfo(c),
			Details2:    details2,
			Public:      c.Public,
		})
	}
	return databases, terminals
}

type existingTab struct {
	ConnID  int64
	Snippet string
	Title   string
	TabDBID int64
}

// fetchExistingTabs mirrors get_database_list's Tab.objects.filter(user=...)
// loop, including the defensive re-check that the tab's connection is still
// either public or still owned by this user (a saved tab can outlive a
// connection's public/private flag changing, or in principle a connection
// being reassigned — matches Python's belt-and-suspenders filter exactly).
func fetchExistingTabs(db *sql.DB, userID int64) ([]existingTab, error) {
	rows, err := db.Query(`
		select t.connection_id, t.snippet, t.title, t.id
		from OmniDB_app_tab t
		join OmniDB_app_connection c on c.id = t.connection_id
		where t.user_id = ?
		  and (c.public = 1 or c.user_id = ?)
		order by t.connection_id
	`, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []existingTab
	for rows.Next() {
		var t existingTab
		if err := rows.Scan(&t.ConnID, &t.Snippet, &t.Title, &t.TabDBID); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// selectedDatabaseIndexPlaceholder mirrors Session.py's v_database_index —
// set to the literal integer 0 the first time *any* connection is added
// (not to that connection's actual id — see Session.AddDatabase), or -1 if
// the user has none. This looks like vestigial/inert state (0 rarely if
// ever matches a real auto-increment connection id, which starts at 1) but
// is reproduced byte-for-byte rather than "fixed", since there's no
// evidence the frontend depends on a more meaningful value and changing it
// is riskier than matching Python's actual (if seemingly pointless) output.
func selectedDatabaseIndexPlaceholder(hasAnyConnection bool) int {
	if hasAnyConnection {
		return 0
	}
	return -1
}
