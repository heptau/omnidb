// Command omnidb-go-server is phase 0 of the Django-to-Go backend migration
// (see /Users/zv/.claude/plans/recursive-petting-sphinx.md for the full
// plan). Today it does nothing on its own: it spawns the existing
// omnidb-server (Python/Django/CherryPy) as a child process and reverse
// proxies every request to it unchanged. Future phases will start answering
// individual routes here directly instead of forwarding them, one vertical
// slice (DB engine) at a time, until the Python child is no longer needed.
//
// It preserves the same process contract wails-app/backend.go already
// depends on: forward all CLI args to the child, and once ready, print a
// single stdout line starting with "http" carrying the login URL — just
// with this proxy's own port substituted for the child's.
package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

// devUpstreamEnv lets a developer point the proxy at an already-running
// Django dev server (e.g. `manage.py runserver`) instead of spawning the
// packaged omnidb-server binary. Production builds never set this.
const devUpstreamEnv = "OMNIDB_PROXY_UPSTREAM"

// listenPortEnv pins the proxy's own listen port instead of picking a free
// one. Useful for dev/testing; production lets the OS choose.
const listenPortEnv = "OMNIDB_PROXY_LISTEN_PORT"

func main() {
	if err := run(); err != nil {
		log.Fatalf("omnidb-go-server: %v", err)
	}
}

func run() error {
	var childCmd *exec.Cmd
	var upstream *url.URL
	readyPath := "" // path+query captured from the child's ready line, "" if none seen yet

	if dev := os.Getenv(devUpstreamEnv); dev != "" {
		u, err := url.Parse(dev)
		if err != nil {
			return fmt.Errorf("parse %s=%q: %w", devUpstreamEnv, dev, err)
		}
		upstream = u
		fmt.Fprintf(os.Stderr, "omnidb-go-server: dev mode, proxying to existing upstream %s\n", upstream)
	} else {
		cmd, childURL, err := spawnServer(os.Args[1:])
		if err != nil {
			return fmt.Errorf("spawn omnidb-server: %w", err)
		}
		childCmd = cmd
		upstream = &url.URL{Scheme: childURL.Scheme, Host: childURL.Host}
		readyPath = childURL.RequestURI()
	}

	listener, err := net.Listen("tcp", listenAddr())
	if err != nil {
		killChild(childCmd)
		return fmt.Errorf("listen: %w", err)
	}
	ownPort := listener.Addr().(*net.TCPAddr).Port

	// Deliberately leave req.Host as the browser-facing address (this
	// proxy's own host:port), not upstream.Host. Django's CSRF middleware
	// compares the incoming Origin header against request.get_host() — if
	// we rewrote Host to the upstream's port, that check would fail with a
	// 403 (Origin says the proxy's port, Host would say Django's), since
	// the browser's Origin always reflects the address it actually loaded
	// the page from. ALLOWED_HOSTS=['*'] on the Django side means it never
	// validates Host itself, so there's no downside to leaving it alone.
	proxy := httputil.NewSingleHostReverseProxy(upstream)

	// Routes migrated to native Go handlers (migration-plan phase 2+) are
	// registered here; everything else keeps forwarding to Django
	// unchanged. mux.Handle requires an exact registered pattern to not
	// fall through, so unmatched paths hit the "/" catch-all below.
	mux := http.NewServeMux()
	mux.Handle("/get_properties_sqlite/", handleGetPropertiesSQLite(upstream, proxy))
	mux.Handle("/get_tables_sqlite/", handleGetTablesSQLite(upstream, proxy))
	mux.Handle("/get_columns_sqlite/", handleGetColumnsSQLite(upstream, proxy))
	mux.Handle("/get_tree_info_sqlite/", handleGetTreeInfoSQLite(upstream, proxy))
	mux.Handle("/get_pk_sqlite/", handleGetPKSQLite(upstream, proxy))
	mux.Handle("/get_pk_columns_sqlite/", handleGetPKColumnsSQLite(upstream, proxy))
	mux.Handle("/get_fks_sqlite/", handleGetFKsSQLite(upstream, proxy))
	mux.Handle("/get_fks_columns_sqlite/", handleGetFKsColumnsSQLite(upstream, proxy))
	mux.Handle("/get_uniques_sqlite/", handleGetUniquesSQLite(upstream, proxy))
	mux.Handle("/get_uniques_columns_sqlite/", handleGetUniquesColumnsSQLite(upstream, proxy))
	mux.Handle("/get_indexes_sqlite/", handleGetIndexesSQLite(upstream, proxy))
	mux.Handle("/get_indexes_columns_sqlite/", handleGetIndexesColumnsSQLite(upstream, proxy))
	mux.Handle("/get_views_sqlite/", handleGetViewsSQLite(upstream, proxy))
	mux.Handle("/get_views_columns_sqlite/", handleGetViewsColumnsSQLite(upstream, proxy))
	mux.Handle("/get_view_definition_sqlite/", handleGetViewDefinitionSQLite(upstream, proxy))
	mux.Handle("/get_triggers_sqlite/", handleGetTriggersSQLite(upstream, proxy))
	mux.Handle("/template_select_sqlite/", handleTemplateSelectSQLite(upstream, proxy))
	mux.Handle("/template_insert_sqlite/", handleTemplateInsertSQLite(upstream, proxy))
	mux.Handle("/template_update_sqlite/", handleTemplateUpdateSQLite(upstream, proxy))
	// PostgreSQL: tree/introspection routes + query execution (migration-plan
	// phase 3; query execution itself is handled by handleCreateRequest below
	// via nativeQueryTechnology). get_properties_postgresql is served
	// natively too, but only for the object kinds in
	// pgSupportedPropertyTypes — everything else (sequences, functions,
	// checks, roles, ...) falls through its own handler to Django.
	// get_tree_info_postgresql stays fully proxied to Django for now — its
	// ~90 DDL-wizard templates are a large, separate porting effort of its
	// own, deliberately deferred to a
	// follow-up slice.
	mux.Handle("/get_schemas_postgresql/", handleGetSchemasPostgreSQL(upstream, proxy))
	mux.Handle("/get_tables_postgresql/", handleGetTablesPostgreSQL(upstream, proxy))
	mux.Handle("/get_columns_postgresql/", handleGetColumnsPostgreSQL(upstream, proxy))
	mux.Handle("/get_pk_postgresql/", handleGetPKPostgreSQL(upstream, proxy))
	mux.Handle("/get_pk_columns_postgresql/", handleGetPKColumnsPostgreSQL(upstream, proxy))
	mux.Handle("/get_fks_postgresql/", handleGetFKsPostgreSQL(upstream, proxy))
	mux.Handle("/get_fks_columns_postgresql/", handleGetFKsColumnsPostgreSQL(upstream, proxy))
	mux.Handle("/get_uniques_postgresql/", handleGetUniquesPostgreSQL(upstream, proxy))
	mux.Handle("/get_uniques_columns_postgresql/", handleGetUniquesColumnsPostgreSQL(upstream, proxy))
	mux.Handle("/get_indexes_postgresql/", handleGetIndexesPostgreSQL(upstream, proxy))
	mux.Handle("/get_indexes_columns_postgresql/", handleGetIndexesColumnsPostgreSQL(upstream, proxy))
	mux.Handle("/get_views_postgresql/", handleGetViewsPostgreSQL(upstream, proxy))
	mux.Handle("/get_views_columns_postgresql/", handleGetViewsColumnsPostgreSQL(upstream, proxy))
	mux.Handle("/get_view_definition_postgresql/", handleGetViewDefinitionPostgreSQL(upstream, proxy))
	mux.Handle("/get_triggers_postgresql/", handleGetTriggersPostgreSQL(upstream, proxy))
	mux.Handle("/get_properties_postgresql/", handleGetPropertiesPostgreSQL(upstream, proxy))
	mux.Handle("/template_select_postgresql/", handleTemplateSelectPostgreSQL(upstream, proxy))
	mux.Handle("/template_insert_postgresql/", handleTemplateInsertPostgreSQL(upstream, proxy))
	mux.Handle("/template_update_postgresql/", handleTemplateUpdatePostgreSQL(upstream, proxy))
	// MySQL + MariaDB: one shared Go implementation registered under both
	// URL suffixes, since Django itself exposes each engine as its own
	// route prefix (views.tree_mysql vs views.tree_mariadb) even though the
	// SQL involved is identical (see go-server/mysql*.go). kill_backend and
	// MariaDB's sequences aren't wired up here — low-value/exotic enough to
	// leave proxied, matching the deferral pattern used elsewhere.
	for _, suffix := range []string{"mysql", "mariadb"} {
		mux.Handle("/get_tree_info_"+suffix+"/", handleGetTreeInfoMySQL(upstream, proxy))
		mux.Handle("/get_tables_"+suffix+"/", handleGetTablesMySQL(upstream, proxy))
		mux.Handle("/get_columns_"+suffix+"/", handleGetColumnsMySQL(upstream, proxy))
		mux.Handle("/get_pk_"+suffix+"/", handleGetPKMySQL(upstream, proxy))
		mux.Handle("/get_pk_columns_"+suffix+"/", handleGetPKColumnsMySQL(upstream, proxy))
		mux.Handle("/get_fks_"+suffix+"/", handleGetFKsMySQL(upstream, proxy))
		mux.Handle("/get_fks_columns_"+suffix+"/", handleGetFKsColumnsMySQL(upstream, proxy))
		mux.Handle("/get_uniques_"+suffix+"/", handleGetUniquesMySQL(upstream, proxy))
		mux.Handle("/get_uniques_columns_"+suffix+"/", handleGetUniquesColumnsMySQL(upstream, proxy))
		mux.Handle("/get_indexes_"+suffix+"/", handleGetIndexesMySQL(upstream, proxy))
		mux.Handle("/get_indexes_columns_"+suffix+"/", handleGetIndexesColumnsMySQL(upstream, proxy))
		mux.Handle("/get_databases_"+suffix+"/", handleGetDatabasesMySQL(upstream, proxy))
		mux.Handle("/get_roles_"+suffix+"/", handleGetRolesMySQL(upstream, proxy))
		mux.Handle("/get_views_"+suffix+"/", handleGetViewsMySQL(upstream, proxy))
		mux.Handle("/get_views_columns_"+suffix+"/", handleGetViewsColumnsMySQL(upstream, proxy))
		mux.Handle("/get_view_definition_"+suffix+"/", handleGetViewDefinitionMySQL(upstream, proxy))
		mux.Handle("/get_functions_"+suffix+"/", handleGetFunctionsMySQL(upstream, proxy))
		mux.Handle("/get_function_fields_"+suffix+"/", handleGetFunctionFieldsMySQL(upstream, proxy))
		mux.Handle("/get_function_definition_"+suffix+"/", handleGetFunctionDefinitionMySQL(upstream, proxy))
		mux.Handle("/get_procedures_"+suffix+"/", handleGetProceduresMySQL(upstream, proxy))
		mux.Handle("/get_procedure_fields_"+suffix+"/", handleGetProcedureFieldsMySQL(upstream, proxy))
		mux.Handle("/get_procedure_definition_"+suffix+"/", handleGetProcedureDefinitionMySQL(upstream, proxy))
		mux.Handle("/get_properties_"+suffix+"/", handleGetPropertiesMySQL(upstream, proxy))
		mux.Handle("/template_select_"+suffix+"/", handleTemplateSelectMySQL(upstream, proxy))
		mux.Handle("/template_insert_"+suffix+"/", handleTemplateInsertMySQL(upstream, proxy))
		mux.Handle("/template_update_"+suffix+"/", handleTemplateUpdateMySQL(upstream, proxy))
	}
	// Oracle: tree/introspection routes + query execution (migration-plan
	// phase 5). get_properties_oracle is served natively for the same kinds
	// this slice's tree routes cover — everything else falls through to
	// Django (see oracleSupportedPropertyTypes). Triggers, partitions,
	// materialized views, and function debugging stay proxied — those routes
	// are commented out in urls.py entirely today, same deferral as the
	// other engines' exotic features.
	mux.Handle("/get_tree_info_oracle/", handleGetTreeInfoOracle(upstream, proxy))
	mux.Handle("/get_tables_oracle/", handleGetTablesOracle(upstream, proxy))
	mux.Handle("/get_columns_oracle/", handleGetColumnsOracle(upstream, proxy))
	mux.Handle("/get_pk_oracle/", handleGetPKOracle(upstream, proxy))
	mux.Handle("/get_pk_columns_oracle/", handleGetPKColumnsOracle(upstream, proxy))
	mux.Handle("/get_fks_oracle/", handleGetFKsOracle(upstream, proxy))
	mux.Handle("/get_fks_columns_oracle/", handleGetFKsColumnsOracle(upstream, proxy))
	mux.Handle("/get_uniques_oracle/", handleGetUniquesOracle(upstream, proxy))
	mux.Handle("/get_uniques_columns_oracle/", handleGetUniquesColumnsOracle(upstream, proxy))
	mux.Handle("/get_indexes_oracle/", handleGetIndexesOracle(upstream, proxy))
	mux.Handle("/get_indexes_columns_oracle/", handleGetIndexesColumnsOracle(upstream, proxy))
	mux.Handle("/get_tablespaces_oracle/", handleGetTablespacesOracle(upstream, proxy))
	mux.Handle("/get_roles_oracle/", handleGetRolesOracle(upstream, proxy))
	mux.Handle("/get_functions_oracle/", handleGetFunctionsOracle(upstream, proxy))
	mux.Handle("/get_function_fields_oracle/", handleGetFunctionFieldsOracle(upstream, proxy))
	mux.Handle("/get_function_definition_oracle/", handleGetFunctionDefinitionOracle(upstream, proxy))
	mux.Handle("/get_procedures_oracle/", handleGetProceduresOracle(upstream, proxy))
	mux.Handle("/get_procedure_fields_oracle/", handleGetProcedureFieldsOracle(upstream, proxy))
	mux.Handle("/get_procedure_definition_oracle/", handleGetProcedureDefinitionOracle(upstream, proxy))
	mux.Handle("/get_sequences_oracle/", handleGetSequencesOracle(upstream, proxy))
	mux.Handle("/get_views_oracle/", handleGetViewsOracle(upstream, proxy))
	mux.Handle("/get_views_columns_oracle/", handleGetViewsColumnsOracle(upstream, proxy))
	mux.Handle("/get_view_definition_oracle/", handleGetViewDefinitionOracle(upstream, proxy))
	mux.Handle("/get_properties_oracle/", handleGetPropertiesOracle(upstream, proxy))
	mux.Handle("/template_select_oracle/", handleTemplateSelectOracle(upstream, proxy))
	mux.Handle("/template_insert_oracle/", handleTemplateInsertOracle(upstream, proxy))
	mux.Handle("/template_update_oracle/", handleTemplateUpdateOracle(upstream, proxy))
	// DB-agnostic app-level views (migration-plan phase 6) — CRUD against
	// Django's own SQLite app database (see go-server/appdb.go), not any
	// user's saved target connection. Only the parts of connections.py that
	// don't touch the in-memory Session object or need SSH tunneling are
	// served here; save_connection/test_connection/delete_connection and all
	// of users.py/monitor_dashboard.py stay proxied to Django (see the
	// go-backend-migration memory note for why).
	mux.Handle("/get_connections/", handleGetConnections(upstream))
	mux.Handle("/save_connection/", handleSaveConnection(upstream))
	mux.Handle("/test_connection/", handleTestConnection(upstream))
	mux.Handle("/delete_connection/", handleDeleteConnection(upstream))
	mux.Handle("/get_groups/", handleGetGroups(upstream))
	mux.Handle("/new_group/", handleNewGroup(upstream))
	mux.Handle("/edit_group/", handleEditGroup(upstream))
	mux.Handle("/delete_group/", handleDeleteGroup(upstream))
	mux.Handle("/save_group_connections/", handleSaveGroupConnections(upstream))
	mux.Handle("/get_all_snippets/", handleGetAllSnippets(upstream))
	mux.Handle("/get_node_children/", handleGetNodeChildren(upstream))
	mux.Handle("/get_snippet_text/", handleGetSnippetText(upstream))
	mux.Handle("/new_node_snippet/", handleNewNodeSnippet(upstream))
	mux.Handle("/delete_node_snippet/", handleDeleteNodeSnippet(upstream))
	mux.Handle("/save_snippet_text/", handleSaveSnippetText(upstream))
	mux.Handle("/rename_node_snippet/", handleRenameNodeSnippet(upstream))
	// workspace.py's DB-agnostic, session-independent slice (migration-plan
	// phase 6.5) — shortcuts, welcome flag, query/console command history.
	// Everything else in workspace.py (get_database_list, edit_data,
	// autocomplete, graphs, save_config_user, ...) still depends on the live
	// Session object and stays proxied — see the go-backend-migration memory
	// for why Fáze 7 (native session/auth) can't start until that's gone.
	mux.Handle("/shortcuts/", handleShortcutsPage(upstream))
	mux.Handle("/close_welcome/", handleCloseWelcome(upstream))
	mux.Handle("/save_shortcuts/", handleSaveShortcuts(upstream))
	mux.Handle("/get_command_list/", handleGetCommandList(upstream))
	mux.Handle("/clear_command_list/", handleClearCommandList(upstream))
	mux.Handle("/get_console_history/", handleGetConsoleHistory(upstream))
	mux.Handle("/clear_console_list/", handleClearConsoleList(upstream))
	mux.Handle("/get_database_list/", handleGetDatabaseList(upstream))
	mux.Handle("/change_active_database/", handleChangeActiveDatabase(upstream))
	mux.Handle("/save_config_user/", handleSaveConfigUser(upstream, proxy))
	// Cross-engine generic routes — registered once for every technology in
	// Django too (see resolveNativeRequest), not per-engine like the tree_*
	// routes. Falls back to Django for "terminal" connections or anything
	// resolveConnection can't resolve.
	mux.Handle("/start_edit_data/", handleStartEditData(upstream, proxy))
	mux.Handle("/draw_graph/", handleDrawGraph(upstream, proxy))
	mux.Handle("/get_autocomplete_results/", handleGetAutocompleteResults(upstream, proxy))
	mux.Handle("/refresh_monitoring/", handleRefreshMonitoring(upstream, proxy))
	mux.Handle("/get_completions/", handleGetCompletions(upstream, proxy))
	mux.Handle("/get_completions_table/", handleGetCompletionsTable(upstream, proxy))
	mux.Handle("/renew_password/", handleRenewPassword(upstream, proxy))
	mux.Handle("/create_request/", handleCreateRequest(upstream, proxy))
	mux.Handle("/clear_client/", handleClearClient(proxy))
	mux.Handle("/", proxy)

	httpServer := &http.Server{Handler: mux}

	serveErrCh := make(chan error, 1)
	go func() {
		serveErrCh <- httpServer.Serve(listener)
	}()

	if readyPath != "" {
		fmt.Printf("http://127.0.0.1:%d%s\n", ownPort, readyPath)
	} else {
		fmt.Fprintf(os.Stderr, "omnidb-go-server: listening on 127.0.0.1:%d, proxying to %s\n", ownPort, upstream)
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)

	select {
	case <-sigCh:
	case err := <-serveErrCh:
		if err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "omnidb-go-server: proxy server stopped: %v\n", err)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
	killChild(childCmd)
	return nil
}

func listenAddr() string {
	if p := os.Getenv(listenPortEnv); p != "" {
		return "127.0.0.1:" + p
	}
	return "127.0.0.1:0"
}

// spawnServer starts the packaged omnidb-server child process, forwarding
// args unchanged, and blocks until it prints its ready line (a stdout line
// starting with "http") or exits early. The child's remaining stdout/stderr
// keep streaming to our own stdout/stderr for the lifetime of the process,
// since wails-app/backend.go now only watches *our* output.
func spawnServer(args []string) (*exec.Cmd, *url.URL, error) {
	serverDir, err := resolveServerDir()
	if err != nil {
		return nil, nil, fmt.Errorf("resolve server dir: %w", err)
	}

	cmd := exec.Command(filepath.Join(serverDir, serverExecutableName()), args...)
	cmd.Dir = serverDir
	cmd.Env = buildServerEnv(serverDir)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, nil, fmt.Errorf("attach stdout: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, nil, fmt.Errorf("attach stderr: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, nil, fmt.Errorf("start: %w", err)
	}

	go streamPassthrough(stderr, os.Stderr)

	readyCh := make(chan *url.URL, 1)
	go func() {
		defer close(readyCh)
		sentReady := false
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			if !sentReady && strings.HasPrefix(line, "http") {
				sentReady = true
				if u, err := url.Parse(line); err == nil {
					readyCh <- u
				}
				continue // don't echo the raw line, it may carry a one-time auth token
			}
			fmt.Fprintln(os.Stdout, line)
		}
	}()

	select {
	case u, ok := <-readyCh:
		if !ok || u == nil {
			return cmd, nil, fmt.Errorf("omnidb-server exited before printing a ready URL")
		}
		return cmd, u, nil
	case <-time.After(60 * time.Second):
		killChild(cmd)
		return nil, nil, fmt.Errorf("timed out waiting for omnidb-server to become ready")
	}
}

func streamPassthrough(r io.Reader, w io.Writer) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		fmt.Fprintln(w, scanner.Text())
	}
}

func killChild(cmd *exec.Cmd) {
	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}
