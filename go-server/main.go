// Command omnidb-go-server is the OmniDB backend — originally phase 0 of
// the Django-to-Go migration (see
// /Users/zv/.claude/plans/recursive-petting-sphinx.md for the full plan),
// now (Fáze 8c) the ONLY backend: every route is either natively
// implemented here or a deliberate no-op/graceful-error stub (see
// go-backend-migration memory for the full route-by-route audit that
// confirmed this). There is no Django/CherryPy/Python child process left
// to spawn — a `dev` mode still exists purely so a developer can point
// this at an already-running Django instance for side-by-side comparison
// during the remainder of this migration's cleanup (see devUpstreamEnv).
//
// Process contract wails-app/backend.go depends on: print a single stdout
// line starting with "http" carrying the login URL once ready, and answer
// /internal/shutdown/ for graceful termination (see handleShutdown).
package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

// devUpstreamEnv lets a developer point this at an already-running Django
// dev server (e.g. `manage.py runserver`) for side-by-side comparison
// during the remainder of this migration's cleanup. Production builds
// never set this — there is no Django to compare against outside a
// developer's own checkout.
const devUpstreamEnv = "OMNIDB_PROXY_UPSTREAM"

// listenPortEnv pins this process's own listen port instead of picking a
// free one. Useful for dev/testing; production lets the OS choose.
const listenPortEnv = "OMNIDB_PROXY_LISTEN_PORT"

// shutdownCtx is cancelled when the process begins shutting down (see
// handleShutdown). Long-running handlers (long-polling, etc.) select on it
// so they unblock immediately instead of keeping httpServer.Shutdown waiting
// up to its full timeout for their request contexts to be cancelled.
var shutdownCtx, shutdownCancel = context.WithCancel(context.Background())

func main() {
	if err := run(); err != nil {
		log.Fatalf("omnidb-go-server: %v", err)
	}
}

func run() error {
	var upstream *url.URL
	standalone := false // true once there's no real Django to compare against — see devUpstreamEnv

	// Fáze 7: Go owns the desktop auto-login token natively (see
	// native_login.go's handleSignInAutomatic) — generated once, up front,
	// so the ready-line construction below can embed it in the URL shown
	// to/navigated by the frontend, matching the exact shape
	// omnidb-server.py used to print for app-mode ("http://localhost:
	// <port>/omnidb_login/?user=admin&pwd=admin&token=<token>").
	if isAppMode(os.Args[1:]) {
		token, err := generateAppToken()
		if err != nil {
			return fmt.Errorf("generate app token: %w", err)
		}
		appToken = token
	}

	if dev := os.Getenv(devUpstreamEnv); dev != "" {
		u, err := url.Parse(dev)
		if err != nil {
			return fmt.Errorf("parse %s=%q: %w", devUpstreamEnv, dev, err)
		}
		upstream = u
		fmt.Fprintf(os.Stderr, "omnidb-go-server: dev mode, proxying to existing upstream %s\n", upstream)
	} else {
		// upstream is kept as a real (if inert) *url.URL purely so none of
		// this file's ~250 mux.Handle(..., upstream, ...) call sites need
		// to change — every one of them already resolved to fully native
		// behavior long before this value stops being dereferenced at all
		// (see connection_info.go/appdb.go's own comments on this same
		// pattern, established back in Fáze 7). It is never used to make a
		// real network call in this mode.
		upstream = &url.URL{Scheme: "http", Host: "127.0.0.1:0"}
		standalone = true
	}

	addr := listenAddr(os.Args[1:])
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	ownPort := listener.Addr().(*net.TCPAddr).Port
	listenHost, _, _ := net.SplitHostPort(addr)

	// proxy is passed as literally every native handler's own `fallback`
	// argument (a leftover name from when this really was a reverse proxy
	// in front of Django — kept rather than renaming ~250 call sites).
	// Fáze 8c: in standalone mode (the only mode any real build runs in
	// now) there's no Django to fall back to at all — every route that
	// still takes a fallback argument only ever reaches it for a
	// confirmed-dead/unreachable Django-only code path (see go-backend-
	// migration memory's full route-by-route audit), so a clean "not
	// supported" envelope is strictly more honest than the connection-
	// refused error a real reverse proxy would have produced. Dev mode
	// (devUpstreamEnv set) keeps a real reverse proxy for side-by-side
	// comparison against an actual running Django instance, including the
	// trusted-header injection OmniDB_app/middleware.py's
	// TrustedUserMiddleware relies on.
	var proxy http.Handler
	if standalone {
		proxy = noUpstreamHandler()
	} else {
		realProxy := httputil.NewSingleHostReverseProxy(upstream)
		baseDirector := realProxy.Director
		realProxy.Director = func(req *http.Request) {
			baseDirector(req)
			req.Header.Del(trustedUserHeader)
			if who, err := resolveIdentity(upstream, req.Header.Get("Cookie")); err == nil && who.Authenticated {
				req.Header.Set(trustedUserHeader, strconv.Itoa(who.UserID))
			}
		}
		proxy = realProxy
	}

	// Routes migrated to native Go handlers (migration-plan phase 2+) are
	// registered here; everything else falls back to proxy above.
	// mux.Handle requires an exact registered pattern to not fall through,
	// so unmatched paths hit the "/" catch-all below.
	// shutdownCh lets wails-app/backend.go's stopBackend ask this process to
	// shut down gracefully over loopback HTTP instead of relying on OS
	// signal delivery — see handleShutdown's comment for why that matters.
	// Buffered so a request that arrives after this process already started
	// shutting down some other way (e.g. sigCh) doesn't block the handler.
	shutdownCh := make(chan struct{}, 1)

	mux := http.NewServeMux()
	// Only registered when actually loopback-only — handleShutdown has no
	// auth check of its own, relying entirely on that (see its comment and
	// listenAddr's). A -H-exposed server instance can still be stopped the
	// normal way (SIGTERM/Ctrl+C, see the sigCh select below).
	if isLoopbackHost(listenHost) {
		mux.Handle("/internal/shutdown/", handleShutdown(shutdownCh))
		mux.Handle("/export_save_dialog/", http.HandlerFunc(handleExportSaveDialog))
	}
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
	mux.Handle("/get_sqlite_version/", handleGetVersionSQLite(upstream, proxy))
	// PostgreSQL: tree/introspection routes + query execution (migration-plan
	// phase 3; query execution itself is handled by handleCreateRequest below
	// via nativeQueryTechnology). get_properties_postgresql is served
	// natively too, but only for the object kinds in
	// pgSupportedPropertyTypes — everything else (sequences, functions,
	// checks, roles, ...) falls through its own handler to Django.
	// get_tree_info_postgresql (123 static DDL-wizard templates, see
	// postgresql_treeinfo.go/postgresql_treeinfo_templates.go) — the last
	// item of Fáze 8a's PostgreSQL long-tail, now natively handled.
	mux.Handle("/get_tree_info_postgresql/", handleGetTreeInfoPostgreSQL(upstream, proxy))
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
	// PostgreSQL long-tail (Fáze 8a) — server-level objects, sequences/types,
	// kill_backend/change_role_password/get_object_description. See
	// go-backend-migration memory for the full catalog this was ported from.
	mux.Handle("/get_database_objects_postgresql/", handleGetDatabaseObjectsPostgreSQL(upstream, proxy))
	mux.Handle("/get_databases_postgresql/", handleGetDatabasesPostgreSQL(upstream, proxy))
	mux.Handle("/get_tablespaces_postgresql/", handleGetTablespacesPostgreSQL(upstream, proxy))
	mux.Handle("/get_roles_postgresql/", handleGetRolesPostgreSQL(upstream, proxy))
	mux.Handle("/get_extensions_postgresql/", handleGetExtensionsPostgreSQL(upstream, proxy))
	mux.Handle("/get_sequences_postgresql/", handleGetSequencesPostgreSQL(upstream, proxy))
	mux.Handle("/get_types_postgresql/", handleGetTypesPostgreSQL(upstream, proxy))
	mux.Handle("/get_domains_postgresql/", handleGetDomainsPostgreSQL(upstream, proxy))
	mux.Handle("/kill_backend_postgresql/", handleKillBackendPostgreSQL(upstream, proxy))
	mux.Handle("/change_role_password_postgresql/", handleChangeRolePasswordPostgreSQL(upstream, proxy))
	mux.Handle("/get_object_description_postgresql/", handleGetObjectDescriptionPostgreSQL(upstream, proxy))
	mux.Handle("/get_postgresql_version/", handleGetVersionPostgreSQL(upstream, proxy))
	mux.Handle("/get_checks_postgresql/", handleGetChecksPostgreSQL(upstream, proxy))
	mux.Handle("/get_excludes_postgresql/", handleGetExcludesPostgreSQL(upstream, proxy))
	mux.Handle("/get_rules_postgresql/", handleGetRulesPostgreSQL(upstream, proxy))
	mux.Handle("/get_rule_definition_postgresql/", handleGetRuleDefinitionPostgreSQL(upstream, proxy))
	mux.Handle("/get_eventtriggers_postgresql/", handleGetEventTriggersPostgreSQL(upstream, proxy))
	mux.Handle("/get_eventtriggerfunctions_postgresql/", handleGetEventTriggerFunctionsPostgreSQL(upstream, proxy))
	mux.Handle("/get_eventtriggerfunction_definition_postgresql/", handleGetEventTriggerFunctionDefinitionPostgreSQL(upstream, proxy))
	mux.Handle("/get_inheriteds_postgresql/", handleGetInheritedsPostgreSQL(upstream, proxy))
	mux.Handle("/get_inheriteds_parents_postgresql/", handleGetInheritedsParentsPostgreSQL(upstream, proxy))
	mux.Handle("/get_inheriteds_children_postgresql/", handleGetInheritedsChildrenPostgreSQL(upstream, proxy))
	mux.Handle("/get_partitions_postgresql/", handleGetPartitionsPostgreSQL(upstream, proxy))
	mux.Handle("/get_partitions_parents_postgresql/", handleGetPartitionsParentsPostgreSQL(upstream, proxy))
	mux.Handle("/get_partitions_children_postgresql/", handleGetPartitionsChildrenPostgreSQL(upstream, proxy))
	mux.Handle("/get_statistics_postgresql/", handleGetStatisticsPostgreSQL(upstream, proxy))
	mux.Handle("/get_statistics_columns_postgresql/", handleGetStatisticsColumnsPostgreSQL(upstream, proxy))
	mux.Handle("/get_mviews_postgresql/", handleGetMaterializedViewsPostgreSQL(upstream, proxy))
	mux.Handle("/get_mviews_columns_postgresql/", handleGetMaterializedViewColumnsPostgreSQL(upstream, proxy))
	mux.Handle("/get_mview_definition_postgresql/", handleGetMaterializedViewDefinitionPostgreSQL(upstream, proxy))
	mux.Handle("/get_functions_postgresql/", handleGetFunctionsPostgreSQL(upstream, proxy))
	mux.Handle("/get_function_fields_postgresql/", handleGetFunctionFieldsPostgreSQL(upstream, proxy))
	mux.Handle("/get_function_definition_postgresql/", handleGetFunctionDefinitionPostgreSQL(upstream, proxy))
	mux.Handle("/get_function_debug_postgresql/", handleGetFunctionDebugPostgreSQL(upstream, proxy))
	mux.Handle("/get_procedures_postgresql/", handleGetProceduresPostgreSQL(upstream, proxy))
	mux.Handle("/get_procedure_fields_postgresql/", handleGetProcedureFieldsPostgreSQL(upstream, proxy))
	mux.Handle("/get_procedure_definition_postgresql/", handleGetProcedureDefinitionPostgreSQL(upstream, proxy))
	mux.Handle("/get_procedure_debug_postgresql/", handleGetProcedureDebugPostgreSQL(upstream, proxy))
	mux.Handle("/get_triggerfunctions_postgresql/", handleGetTriggerFunctionsPostgreSQL(upstream, proxy))
	mux.Handle("/get_triggerfunction_definition_postgresql/", handleGetTriggerFunctionDefinitionPostgreSQL(upstream, proxy))
	mux.Handle("/get_aggregates_postgresql/", handleGetAggregatesPostgreSQL(upstream, proxy))
	mux.Handle("/template_select_function_postgresql/", handleTemplateSelectFunctionPostgreSQL(upstream, proxy))
	mux.Handle("/template_call_procedure_postgresql/", handleTemplateCallProcedurePostgreSQL(upstream, proxy))
	mux.Handle("/get_physicalreplicationslots_postgresql/", handleGetPhysicalReplicationSlotsPostgreSQL(upstream, proxy))
	mux.Handle("/get_logicalreplicationslots_postgresql/", handleGetLogicalReplicationSlotsPostgreSQL(upstream, proxy))
	mux.Handle("/get_publications_postgresql/", handleGetPublicationsPostgreSQL(upstream, proxy))
	mux.Handle("/get_publication_tables_postgresql/", handleGetPublicationTablesPostgreSQL(upstream, proxy))
	mux.Handle("/get_subscriptions_postgresql/", handleGetSubscriptionsPostgreSQL(upstream, proxy))
	mux.Handle("/get_subscription_tables_postgresql/", handleGetSubscriptionTablesPostgreSQL(upstream, proxy))
	mux.Handle("/get_foreign_data_wrappers_postgresql/", handleGetForeignDataWrappersPostgreSQL(upstream, proxy))
	mux.Handle("/get_foreign_servers_postgresql/", handleGetForeignServersPostgreSQL(upstream, proxy))
	mux.Handle("/get_user_mappings_postgresql/", handleGetUserMappingsPostgreSQL(upstream, proxy))
	mux.Handle("/get_foreign_tables_postgresql/", handleGetForeignTablesPostgreSQL(upstream, proxy))
	mux.Handle("/get_foreign_columns_postgresql/", handleGetForeignColumnsPostgreSQL(upstream, proxy))
	// MySQL + MariaDB: one shared Go implementation registered under both
	// URL suffixes, since Django itself exposes each engine as its own
	// route prefix (views.tree_mysql vs views.tree_mariadb) even though the
	// SQL involved is identical (see go-server/mysql*.go).
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
		mux.Handle("/kill_backend_"+suffix+"/", handleKillBackendMySQL(upstream, proxy))
	}
	// MariaDB-only (MySQL has no sequence concept) — see mariadbSequences'
	// comment: the real Django route is confirmed broken today (decorator/
	// signature mismatch), so this is also a bugfix, not just a port.
	mux.Handle("/get_sequences_mariadb/", handleGetSequencesMariaDB(upstream, proxy))
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
	mux.Handle("/kill_backend_oracle/", handleKillBackendOracle(upstream, proxy))
	// DB-agnostic app-level views (migration-plan phase 6, now complete) —
	// CRUD against the app's own SQLite database (see go-server/appdb.go),
	// not any user's saved target connection. save_connection/
	// test_connection/delete_connection use golang.org/x/crypto/ssh directly
	// (see ssh_tunnel.go/terminal.go) instead of Session.AddDatabase/
	// RemoveDatabase — see the go-backend-migration memory for why that's
	// safe. users.py and monitor_dashboard.py are both fully native too
	// (see the dedicated comment further down) — stale note about them
	// still proxying to Django removed, they haven't since Fáze 7/8a.
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
	// workspace.py's DB-agnostic slice (migration-plan phase 6.5, now
	// complete) — shortcuts, welcome flag, query/console command history,
	// database list, draw_graph, autocomplete, change_active_database,
	// save_config_user (including its password-change branch — Go now has
	// its own Django-compatible PBKDF2 hashing, see hashDjangoPassword,
	// built for Fáze 7's native login). None of these depend on Django's
	// live Session object anymore — see the go-backend-migration memory for
	// how each one was confirmed safe to re-derive fresh instead. Remaining
	// Django-only pieces: PostgreSQL debugger (confirmed dead code) and
	// monitor_dashboard.py (RestrictedPython sandboxed eval, needs a
	// redesign, not a mechanical port).
	mux.Handle("/close_welcome/", handleCloseWelcome(upstream))
	mux.Handle("/save_shortcuts/", handleSaveShortcuts(upstream))
	mux.Handle("/get_command_list/", handleGetCommandList(upstream))
	mux.Handle("/clear_command_list/", handleClearCommandList(upstream))
	mux.Handle("/get_console_history/", handleGetConsoleHistory(upstream))
	mux.Handle("/clear_console_list/", handleClearConsoleList(upstream))
	mux.Handle("/get_database_list/", handleGetDatabaseList(upstream))
	mux.Handle("/change_active_database/", handleChangeActiveDatabase(upstream))
	mux.Handle("/save_config_user/", handleSaveConfigUser(upstream))
	// users.py — superuser-only user management, unblocked by Fáze 7's
	// native Django-compatible PBKDF2 hashing (previously deferred since a
	// Go-written hash in a different format would have broken Django-owned
	// auth; Django no longer owns auth at all now).
	mux.Handle("/get_users/", handleGetUsers(upstream))
	mux.Handle("/new_user/", handleNewUser(upstream))
	mux.Handle("/remove_user/", handleRemoveUser(upstream))
	mux.Handle("/save_users/", handleSaveUsers(upstream))
	// monitor_dashboard.py — CRUD ported in full; the 17 built-in monitoring
	// units run as native Go code (see monitoring_units.go) instead of
	// RestrictedPython's sandboxed exec(), which has no Go equivalent. Custom
	// user-authored units run a single SQL query (custom_monitor_query.go)
	// instead of arbitrary script_chart/script_data code — no new security
	// boundary crossed (same connection access the SQL editor already has),
	// just no more "write two Python scripts". Deliberate scope decision,
	// confirmed with the user.
	mux.Handle("/get_monitor_unit_list/", handleGetMonitorUnitList(upstream))
	mux.Handle("/get_monitor_unit_details/", handleGetMonitorUnitDetails(upstream))
	mux.Handle("/get_monitor_units/", handleGetMonitorUnits(upstream))
	mux.Handle("/get_monitor_unit_template/", handleGetMonitorUnitTemplate(upstream))
	mux.Handle("/save_monitor_unit/", handleSaveMonitorUnit(upstream))
	mux.Handle("/delete_monitor_unit/", handleDeleteMonitorUnit(upstream))
	mux.Handle("/remove_saved_monitor_unit/", handleRemoveSavedMonitorUnit(upstream))
	mux.Handle("/update_saved_monitor_unit_interval/", handleUpdateSavedMonitorUnitInterval(upstream))
	mux.Handle("/refresh_monitor_units/", handleRefreshMonitorUnits(upstream, proxy))
	mux.Handle("/test_monitor_script/", handleTestMonitorScript(upstream, proxy))
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
	mux.Handle("/clear_client/", handleClearClient())
	mux.Handle("/long_polling/", handleLongPolling())
	mux.Handle("/client_keep_alive/", handleClientKeepAlive())
	// Fáze 7: native login/session, replacing views.login entirely for the
	// browser-facing auth front door.
	mux.Handle("/omnidb_login/", handleLoginPage(upstream))
	mux.Handle("/sign_in/", handleSignIn(upstream))
	mux.Handle("/logout/", handleLogout())

	// Fáze 8b: native /workspace/ page render + root "/" (check_session) +
	// check_session_message — see workspace_page.go.
	mux.Handle("/workspace/", handleWorkspacePage(upstream))
	mux.Handle("/check_session_message/", handleCheckSessionMessage())

	// indent_sql uses a generic, dialect-agnostic reindenter — see
	// handleIndentSQL's comment for the planned PostgreSQL-specific
	// pg_procrustes tier on top of this.
	mux.Handle("/indent_sql/", handleIndentSQL(upstream))

	mux.Handle("/static/", handleStaticAssets())
	if tempDir, err := resolveTempDir(upstream); err != nil {
		log.Printf("resolveTempDir: %v (export downloads will fail until this is fixed)", err)
	} else {
		mux.Handle("/static/temp/", handleTempFiles(tempDir.TempDir))
	}
	mux.Handle("/", handleRoot(upstream, proxy))

	httpServer := &http.Server{Handler: mux}

	serveErrCh := make(chan error, 1)
	go func() {
		serveErrCh <- httpServer.Serve(listener)
	}()

	// Ready-line format matches exactly what omnidb-server.py used to print
	// for app-mode ("http://localhost:<port>/omnidb_login/?user=admin&
	// pwd=admin&token=<APP_TOKEN>") — wails-app/backend.go parses this
	// line verbatim (see its own streamServerOutput), so the shape has to
	// stay byte-compatible even though Go now constructs it directly
	// instead of relaying/rewriting a spawned child's own copy.
	switch {
	case standalone && appToken != "":
		fmt.Printf("http://127.0.0.1:%d/omnidb_login/?user=admin&pwd=admin&token=%s\n", ownPort, appToken)
	case standalone:
		fmt.Fprintf(os.Stderr, "omnidb-go-server: listening on %s:%d — open http://%s:%d/omnidb_login/ in your browser\n", listenHost, ownPort, listenHost, ownPort)
	default:
		fmt.Fprintf(os.Stderr, "omnidb-go-server: listening on 127.0.0.1:%d, proxying to %s\n", ownPort, upstream)
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)

	select {
	case <-sigCh:
	case <-shutdownCh:
	case err := <-serveErrCh:
		if err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "omnidb-go-server: server stopped: %v\n", err)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
	return nil
}

// noUpstreamHandler replaces the old Django reverse-proxy fallback in
// standalone mode (see run()) — every registered route's fallback
// argument should only ever reach this for a confirmed-dead/unreachable
// Django-only code path (see go-backend-migration memory's full route-by-
// route audit), so a clean envelope here is strictly more honest than the
// connection-refused error a real reverse proxy would have produced.
func noUpstreamHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeEnvelope(w, "This feature is not available.", true, -1)
	})
}

// handleShutdown lets wails-app/backend.go's stopBackend trigger this
// process's own graceful-shutdown path (see run()'s select on shutdownCh)
// over loopback HTTP instead of relying on OS signal delivery. No extra
// auth/origin check needed beyond responding at all: this listener is
// already bound to 127.0.0.1-only (see listenAddr), the same trust
// boundary every other route in this file relies on.
func handleShutdown(shutdownCh chan<- struct{}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		shutdownCancel()
		w.WriteHeader(http.StatusOK)
		select {
		case shutdownCh <- struct{}{}:
		default:
		}
	}
}
