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

exposeGlobals(treeSnippets)
