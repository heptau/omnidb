package main

import (
	"database/sql"
	"net/url"
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
// just the file's basename, everything else shows "user@database" (or
// whichever part is non-empty, falling back to "" if neither is set).
// Falls back to extracting user/database from the ConnString URL when the
// discrete fields are empty (connections configured solely via URL).
func printDatabaseInfo(c appConnection) string {
	if c.Technology == "sqlite" {
		parts := strings.Split(c.Database, "/")
		return parts[len(parts)-1]
	}
	user, db := c.Username, c.Database
	if user == "" && db == "" && c.ConnString != "" {
		if u, err := url.Parse(c.ConnString); err == nil {
			if u.User != nil {
				user = u.User.Username()
			}
			if p := strings.TrimPrefix(u.Path, "/"); p != "" {
				db = p
			}
		}
	}
	switch {
	case user != "" && db != "":
		return user + "@" + db
	case user != "":
		return user
	case db != "":
		return db
	}
	return ""
}

// printDatabaseDetails mirrors each engine's PrintDatabaseDetails() —
// SQLite is always "Local File", everything else is "server:port" (or
// whichever part is non-empty, falling back to "" if neither is set).
// Falls back to extracting host/port from the ConnString URL when the
// discrete fields are empty (connections configured solely via URL).
func printDatabaseDetails(c appConnection) string {
	if c.Technology == "sqlite" {
		return "Local File"
	}
	host, port := c.Server, c.Port
	if host == "" && port == "" && c.ConnString != "" {
		if u, err := url.Parse(c.ConnString); err == nil {
			host = u.Hostname()
			port = u.Port()
		}
	}
	switch {
	case host != "" && port != "":
		return host + ":" + port
	case host != "":
		return host
	case port != "":
		return port
	}
	return ""
}

type databaseListEntry struct {
	DBType         string
	Alias          string
	ConnID         int64
	ConsoleHelp    string
	Database       string
	ConnString     string
	Details1       string
	Details2       string
	Public         bool
	Environment    string
	Server         string
	Port           string
	Username       string
	PgpassDatabase string
}

// resolvePgpassMatchFields returns the discrete host/port/user/database
// OmniDB actually connects with for c, falling back to parsing ConnString
// when the discrete fields are empty (connections configured solely via
// URL) — same fallback printDatabaseDetails/printDatabaseInfo apply to
// their combined display strings, kept separate here rather than shared
// with them so a change to this (used only for the frontend's own .pgpass
// matching, see passwords.js) can't accidentally shift what those two
// already-relied-on display strings render, or what the general Database
// field (databaseListEntry.Database, straight from c.Database) means to
// its other consumers — workspace.js's own active-database-override
// mechanism in particular sends that field's value on to
// applyActiveDatabaseOverride, where a blank value specifically means "no
// override, use ConnString's own embedded database untouched" (see
// postgresqlDSN's comment on that same distinction); resolving it here
// instead would turn every ConnString-only connection into an explicit
// (if equivalent) override, an unrelated behavior change this had no
// reason to risk. Returned as PgpassDatabase, a field with no other
// consumer.
//
// Port defaults to 5432 when blank, mirroring postgresqlDSN's own default
// (postgresql.go) exactly — a connection saved with Port left empty (very
// common: the form's own placeholder already suggests 5432, and leaving it
// blank "just works" the same way) still actually connects on 5432, so a
// .pgpass entry written with the real, explicit port "5432" needs the same
// default here or every such connection reports a false "no matching
// entry" against an otherwise-correct passfile.
func resolvePgpassMatchFields(c appConnection) (server, port, username, database string) {
	// Mirrors postgresqlDSN's own two branches exactly: a connstring-only
	// connection (Server left blank) never looks at the discrete
	// Port/Database fields at all, so defaulting/using them before this
	// check would wrongly skip parsing ConnString's own embedded host/path
	// below.
	if c.Server == "" && c.ConnString != "" {
		if u, err := url.Parse(c.ConnString); err == nil {
			server = u.Hostname()
			port = u.Port()
			if u.User != nil {
				username = u.User.Username()
			}
			database = strings.TrimPrefix(u.Path, "/")
		}
	} else {
		server, port, username, database = c.Server, c.Port, c.Username, c.Database
	}
	if port == "" {
		port = "5432"
	}
	return server, port, username, database
}

type remoteTerminalEntry struct {
	ConnID      int64
	Alias       string
	Details     string
	Public      bool
	Environment string
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
				ConnID:      c.ID,
				Alias:       c.Alias,
				Details:     c.SSHUser + "@" + c.SSHServer + ":" + c.SSHPort,
				Public:      c.Public,
				Environment: c.Environment,
			})
		}
		if c.Technology == "terminal" {
			continue
		}

		details2 := printDatabaseDetails(c)
		if c.UseTunnel {
			details2 += " <b>(" + c.SSHServer + ":" + c.SSHPort + ")</b>"
		}
		server, port, username, pgpassDatabase := resolvePgpassMatchFields(c)
		databases = append(databases, databaseListEntry{
			DBType:         c.Technology,
			Alias:          c.Alias,
			ConnID:         c.ID,
			ConsoleHelp:    consoleHelpForTechnology(c.Technology),
			Database:       c.Database,
			ConnString:     c.ConnString,
			Details1:       printDatabaseInfo(c),
			Details2:       details2,
			Public:         c.Public,
			Environment:    c.Environment,
			Server:         server,
			Port:           port,
			Username:       username,
			PgpassDatabase: pgpassDatabase,
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
		order by
			(select max(last_used) from OmniDB_app_tab
			 where user_id = t.user_id and connection_id = t.connection_id) asc,
			t.last_used asc
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
