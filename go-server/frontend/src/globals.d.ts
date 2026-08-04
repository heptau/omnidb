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

// --- third-party libraries, loaded from lib/ as <script> tags --------------

declare const $: any;
declare const jQuery: any;
declare const bootstrap: any;
declare const ace: any;
declare const agGrid: any;
declare const cytoscape: any;
declare const moment: any;
declare const Chart: any;
/** xterm.js */
declare const Terminal: any;
/** xterm's fit addon (lib/xterm/fit.js) */
declare const fit: any;
/** AimaraJS, the object tree (lib/aimaraJS) */
declare const createTree: any;
/** Bootstrap's Tooltip constructor, used directly in the PostgreSQL tree */
declare const Tooltip: any;
/** The pgexplain bundle in lib/explain — ships its own React and D3 */
declare const React: any;
declare const ReactDOM: any;
declare const PGPlan: any;
declare const PGPlanNodes: any;

interface Window {
	/** The Handsontable-compatible factory AgGridAdapter.js installs. */
	Handsontable: any;
	AgGridAdapter: any;
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
}

/** Installed by AgGridAdapter.js — see its bottom. */
declare const Handsontable: any;

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
