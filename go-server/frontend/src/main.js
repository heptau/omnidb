/**
 * Bundle entry point for the workspace UI.
 *
 * The import order below mirrors the order the corresponding <script> tags
 * had in workspace.html, which is the only dependency graph this code has
 * ever had. Keep adding to the bottom as files migrate, and keep it in that
 * same order -- see README.md.
 */
import { exposeGlobals } from './legacy-globals.js'

import * as treeSnippets from './tree_context_functions/tree_snippets.js'
import * as treePostgresql from './tree_context_functions/tree_postgresql.js'
import * as treeOracle from './tree_context_functions/tree_oracle.js'
import * as treeMariadb from './tree_context_functions/tree_mariadb.js'
import * as treeMysql from './tree_context_functions/tree_mysql.js'
import * as treeSqlite from './tree_context_functions/tree_sqlite.js'
import * as renderers from './renderers.js'
import * as headerActions from './header_actions.js'
import * as query from './query.js'
import * as customMenu from './custom_menu.js'
import * as notificationControl from './notification_control.js'
import * as outerSnippetPanel from './panel_functions/outer_snippet_panel.js'
import * as passwords from './passwords.js'
import * as properties from './properties.js'
import * as tabs from './tabs.js'
import * as outerConnectionTab from './tab_functions/outer_connection_tab.js'
import * as outerTerminalTab from './tab_functions/outer_terminal_tab.js'
import * as outerWelcomeTab from './tab_functions/outer_welcome_tab.js'
import * as innerEditDataTab from './tab_functions/inner_edit_data_tab.js'
import * as innerGraphTab from './tab_functions/inner_graph_tab.js'
import * as innerSnippetTab from './tab_functions/inner_snippet_tab.js'
import * as innerQueryTab from './tab_functions/inner_query_tab.js'
import * as innerConsoleTab from './tab_functions/inner_console_tab.js'
import * as innerMonitoringDashboardTab from './tab_functions/inner_monitoring_dashboard_tab.js'
import * as innerMonitoringTab from './tab_functions/inner_monitoring_tab.js'
import * as websiteTab from './tab_functions/website_tab.js'

exposeGlobals(
  treeSnippets,
  treePostgresql,
  treeOracle,
  treeMariadb,
  treeMysql,
  treeSqlite,
  renderers,
  headerActions,
  query,
  customMenu,
  notificationControl,
  outerSnippetPanel,
  passwords,
  properties,
  tabs,
  outerConnectionTab,
  outerTerminalTab,
  outerWelcomeTab,
  innerEditDataTab,
  innerGraphTab,
  innerSnippetTab,
  innerQueryTab,
  innerConsoleTab,
  innerMonitoringDashboardTab,
  innerMonitoringTab,
  websiteTab,
)
