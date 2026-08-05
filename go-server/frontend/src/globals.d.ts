// Ambient declarations for the globals this bundle uses but does not own.
//
// Nothing here changes what runs. It exists so `npm run typecheck` reports
// real problems instead of drowning them in "Cannot find name" for every
// reference to jQuery or to a value workspace.html put on the window. Every
// name below was arrived at by elimination: it is read by at least one file
// that never assigns it, so it cannot be turned into a module-local
// declaration without breaking the coupling.
//
// `any` throughout, deliberately. That is honestly all that is known about a
// library arriving as a <script> tag; inventing shapes here would produce
// confident-looking nonsense. Real types are one of the payoffs of moving
// these to npm packages.

// --- prototype extensions ---------------------------------------------------
//
// query.js installs this on Number.prototype as a side effect of being
// imported; console.js and terminal.js rely on that import order rather than
// defining their own copy.

interface Number {
	padLeft(base?: number, chr?: string): string;
}

// custom_menu.js's own ad-hoc nesting-depth marker on the elements it builds --
// not a real DOM property, just a plain expando it reads back off `this`/
// sibling elements while walking the menu tree it just created.
interface HTMLElement {
	aimara_level?: number;
}

// --- third-party libraries, loaded from lib/ as <script> tags --------------

declare const $: any;
declare const jQuery: any;
declare const bootstrap: any;
declare const agGrid: any;
declare const ace: any;
declare const cytoscape: any;
declare const Chart: any;
/** xterm.js */
declare const Terminal: any;
/** xterm's fit addon (lib/xterm/fit.js) */
declare const fit: any;
/** AimaraJS, the object tree (lib/aimaraJS) */
declare const createTree: any;
/** The pgexplain bundle in lib/explain — ships its own React and D3 */
declare const React: any;
declare const ReactDOM: any;
declare const PGPlan: any;
declare const PGPlanNodes: any;

// Both a bare `declare const` above and a `Window` property below exist for
// $, jQuery, bootstrap, agGrid and Chart: the bare form types code that reads
// them as ordinary identifiers (nearly everything), the Window form types the
// `window.x = x` assignment each *-global.js file makes to publish them.

interface Window {
	/** The Handsontable-compatible factory AgGridAdapter.js installs. */
	Handsontable: any;
	AgGridAdapter: any;
	/** Published by jquery-global.js -- see its comment. */
	$: any;
	jQuery: any;
	/** Published by bootstrap-framework-global.js -- see its comment. */
	bootstrap: any;
	/** Published by ag-grid-global.js -- see its comment. */
	agGrid: any;
	/** Published by chartjs-global.js -- see its comment. */
	Chart: any;
	/**
	 * early.js's `exposeGlobals(ajaxControl)` call publishes its instance of
	 * ajax_control.js here before the main bundle runs. ajax_control_bridge.js
	 * reads these back off `window` rather than importing ajax_control.js
	 * directly, so every workspace request shares the one instance the loading
	 * overlay's Cancel button is wired to. See ajax_control_bridge.js.
	 */
	execAjax: any;
	startLoading: any;
	endLoading: any;
	getCookie: any;
	csrfSafeMethod: any;
	/** users.js's scratch state for pending (unsaved) new users -- see getUsers(). */
	newUsersObject: any;
	/** workspace.js's drawGraph() stashes the active cytoscape instance here for console debugging. */
	cy: any;
}

/** Installed by AgGridAdapter.js — see its bottom. */
declare const Handsontable: any;

// --- npm packages whose own source tsc cannot parse -------------------------
//
// chart.js@2.9.4 ships JSDoc old enough that this project's TypeScript chokes
// parsing dist/Chart.js directly (a syntax error inside the package, not
// anything under src/). A `declare module 'chart.js'` here would not help --
// TypeScript only falls back to an ambient declaration when a specifier fails
// to resolve, and chart.js resolves just fine. jsconfig.json's `paths` remaps
// the specifier itself to src/types/chart.js.d.ts instead; Vite's bundler
// resolution is untouched by tsconfig `paths`, so the real package still
// ships at runtime.

declare module 'chartjs-plugin-annotation';

// --- state owned by workspace.html's inline bootstrap script ---------------
//
// These are declared there because bundled code assigns to them at runtime and
// they therefore have to be real properties of the global object rather than
// module-local bindings. See the comment in workspace.html.

declare let v_connTabControl: any;
declare let v_connections_data: any;
declare let v_omnis: any;
declare let v_explain_control: any;
declare let v_shortcut_object: any;
declare let v_usersObject: any;
declare let v_editContentObject: any;
declare let v_canEditContent: any;
declare let v_completer_ready: boolean;

// --- server-rendered page config, published by src/bootstrap-globals.js ----
//
// Several of these are reassigned at runtime (the Settings dialog writes the
// editor theme, font size and formatting options straight back), which is why
// bootstrap-globals publishes onto window instead of exporting.

declare let v_url_folder: string;
declare let v_csrf_cookie_name: string;
declare let v_editor_theme: string;
declare let v_font_size: number;
declare let v_theme: string;
declare let v_indent_char: string;
declare let v_indent_size: number;
declare let v_indent_unit: string;
declare let v_csv_encoding: string;
declare let v_csv_delimiter: string;
declare let v_comma_style: string;
declare let v_keyword_case: string;
declare let v_autocomplete_disabled_types: string;
declare let v_show_terminal_option: boolean;
declare let gv_desktopMode: boolean;

// --- reachable across a bundle boundary ------------------------------------
//
// ajax_control.js and notification_control.js appear in more than one bundle,
// so they cannot import from each other without Rollup duplicating a module
// into every bundle that reaches it (see README.md). Their references to one
// another stay runtime global lookups.

declare function execAjax(
	url: string,
	data: string,
	successFunc?: ((r: any) => void) | null,
	errorFunc?: ((r: any) => void) | null,
	notifMode?: string | null,
	loading?: boolean | null,
	cancelButton?: boolean | null,
	onAjaxErrorCallBack?: ((msg: any) => void) | false,
): void;
declare function showAlert(info: any, funcYes?: (() => void) | null, large?: boolean | null, isHtml?: boolean): void;

// There used to be a note here about queryAdvancedObjectSearch,
// checkAdvancedObjectSearchStatus and advancedObjectSearchReturn being called
// but defined nowhere. Their only caller — tabAdvancedObjectSearch, a thousand
// lines whose menu entry had been commented out — is deleted, so there is
// nothing left to declare or to warn about.
