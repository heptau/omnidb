// Ambient declarations for the browser globals this bundle does not own.
//
// The third-party libraries are still plain <script> tags (see README.md), so
// they arrive as globals with no types attached. Declaring them here is not an
// attempt to describe their APIs — `any` is honest about what is actually
// known — it just stops every reference to them reading as an undefined name
// and burying the type errors that matter.

/** AG Grid Community v28, loaded from lib/ag-grid as a global. */
declare const agGrid: any;

/** jQuery, loaded from lib/jquery as a global. */
declare const $: any;

/** Ace, loaded from lib/ace as a global. */
declare const ace: any;

interface Window {
	/** The Handsontable-compatible factory AgGridAdapter.js installs. */
	Handsontable: any;
	AgGridAdapter: any;
}
