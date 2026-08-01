// @ts-check
/*
 * AG Grid Adapter - Provides Handsontable-like API for AG Grid v28
 * This adapter maps Handsontable API calls to AG Grid API
 */

export class AgGridAdapter {
	constructor(container, options) {
		this.container = container;
		this.options = options || {};
		this.gridApi = null;
		this.columnApi = null;
		/** @type {any} */
		this.gridOptions = {};
		/** @type {any} */
		this._agGrid = null;
		this._gridDiv = document.createElement("div");
		/** @type {((e: MediaQueryListEvent) => void) | null} */
		this._mediaQueryListener = null;
		/** @type {HTMLElement | null} */
		this._contextMenuElement = null;

		// Opt-in, and deliberately not inferred from the Handsontable options
		// that would seem to imply it. Almost every grid in the app passes a
		// `cells` callback and several pass `fixedColumnsLeft`, but only the
		// Edit Data grid is meant to be writable — switching editing on for
		// the rest because they happen to share an option would be a much
		// larger behaviour change than this shim should make on its own.
		// Everything below that is gated on this flag leaves every other grid
		// byte-for-byte as it was.
		this._editable = !!this.options.omnidbEditable;
		this._minSpareRows = this._editable ? this.options.minSpareRows || 0 : 0;

		this._initGrid();
	}

	_initGrid() {
		const self = this;

		let columns = this.options.columns || [];
		const data = this._withSpareRows(this.options.data || []);

		if (columns.length === 0 && data.length > 0) {
			const numCols = data[0].length;
			for (let i = 0; i < numCols; i++) {
				columns.push({
					field: "col_" + i,
					headerName: "Column " + (i + 1),
					width: 120,
					resizable: true,
				});
			}
		}

		this.gridOptions = {
			columnDefs: this._createColumnDefs(columns),
			rowData: this._createRowData(data),
			defaultColDef: {
				// Sorting is Handsontable-ish reordering of a fixed result set
				// in every other grid, but in the editable one it would divorce
				// the displayed row order from the infoRows[] indexes that
				// edit_data.js addresses rows by — a sort would silently
				// misattribute every pending change.
				sortable: !this._editable,
				resizable: true,
				filter: false,
				editable: false,
			},
			rowSelection: "single",
			animateRows: false,
			rowHeight: 28,
			headerHeight: 28,
			// Handsontable's selectCell()+deselectCell() (see the comment on deselectCell below)
			// is meant to be a transient, purely visual nudge (scroll a row into view, briefly
			// mark it selected) - it was never meant to move real keyboard focus anywhere. AG
			// Grid's own cell-focus tracking disagrees: setFocusedCell() schedules an async
			// "cellFocused" event whose handler calls the cell's DOM .focus() *after* the
			// deselectCell() that was supposed to undo it, and after any .focus() callers make
			// on their own input right afterwards - stealing focus back to the grid. Callers
			// that want a real, persistent, copyable cell/range selection (e.g. the "copy" grid
			// context menu action, which relies on document.execCommand("copy") over a genuine
			// selection) still need this on, so it's opt-out per grid via options.suppressCellFocus
			// rather than disabled globally.
			suppressCellFocus: !!this.options.suppressCellFocus,

			onGridReady: function (params) {
				self.gridApi = params.api;
				self.columnApi = params.columnApi;
				setTimeout(() => {
					self._smartSizeColumns();
				}, 100);
			},

			onFirstDataRendered: function () {
				setTimeout(() => {
					self._smartSizeColumns();
				}, 100);
			},

			onCellContextMenu: function (params) {
				if (self.options.contextMenu) {
					params.event.preventDefault();
					self._showContextMenu(params.event, params);
				}
			},
		};

		if (this._editable) {
			// Handsontable commits an edit as soon as the cell loses focus;
			// AG Grid would otherwise discard it and quietly revert.
			this.gridOptions.stopEditingWhenCellsLoseFocus = true;
			this.gridOptions.singleClickEdit = false;
			this.gridOptions.suppressRowClickSelection = false;
		}

		this._gridDiv.style.width = "100%";
		this._gridDiv.style.height = "100%";

		const applyTheme = () => {
			const isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
			this._gridDiv.className = isDark ? "ag-theme-alpine-dark ag-theme-omnidb" : "ag-theme-alpine ag-theme-omnidb";
		};

		applyTheme();

		if (window.matchMedia) {
			this._mediaQueryListener = (e) => applyTheme();
			window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", this._mediaQueryListener);
		}

		this.container.appendChild(this._gridDiv);

		this._agGrid = new agGrid.Grid(this._gridDiv, this.gridOptions);
	}

	_smartSizeColumns() {
		if (!this.gridApi) return;
		const gridWidth = this._gridDiv.clientWidth;
		const columnDefs = this.gridApi.getColumnDefs();
		if (!columnDefs || columnDefs.length === 0) return;

		const minColWidth = 120;
		const totalMinWidth = columnDefs.length * minColWidth;

		if (totalMinWidth <= gridWidth) {
			this.gridApi.sizeColumnsToFit();
		}
	}

	_calculateHeight(rowCount) {
		return "100%";
	}

	_createColumnDefs(columns) {
		const self = this;
		const fixedLeft = this._editable ? this.options.fixedColumnsLeft || 0 : 0;

		return columns.map((col, index) => {
			const fallbackName = "Column " + (index + 1);
			const title = col.title || fallbackName;
			const titleText = this._htmlToText(title) || fallbackName;

			const colDef = {
				field: "col_" + index,
				// Plain text, always. AG Grid's headerName is text, not HTML,
				// so markup used to be shown literally ("<span>name</...").
				headerName: titleText,
				width: col.width || 120,
				resizable: true,
				sortable: !this._editable,
				headerTooltip: this._htmlToText(col.tooltip) || titleText,
				comparator: function (valueA, valueB, nodeA, nodeB, isInverted) {
					return self._numericCompare(valueA, valueB, isInverted);
				},
			};

			// Only when the title actually carries markup — edit_data.js builds
			// a key icon for primary keys plus a tooltip icon holding the column
			// type. Every other grid passes a plain string and keeps AG Grid's
			// stock header untouched.
			const headerTemplate = this._headerTemplate(title);
			if (headerTemplate) {
				colDef.headerComponentParams = { template: headerTemplate };
			}

			if (col.pinned) {
				colDef.pinned = col.pinned;
			} else if (index < fixedLeft) {
				colDef.pinned = "left";
			}

			if (col.align) {
				colDef.cellStyle = { textAlign: col.align };
			}

			if (this._editable) {
				colDef.editable = function (params) {
					const props = self._cellProperties(params.node.rowIndex, index);
					return !props.readOnly;
				};
				// valueSetter rather than onCellValueChanged: Handsontable's
				// beforeChange runs before the value is committed and sees both
				// sides of it, which is exactly what edit_data.js's hook reads.
				colDef.valueSetter = function (params) {
					return self._applyCellEdit(params, index);
				};
				colDef.cellRenderer = function (params) {
					return self._renderCell(params, index);
				};
			} else if (col.renderer === "html") {
				colDef.cellRenderer = function (params) {
					if (params.value) {
						return params.value;
					}
					return "";
				};
			}

			return colDef;
		});
	}

	// Handsontable rendered a column title as HTML. AG Grid's default header
	// component writes displayName into its eText node as text, so the markup
	// has to go into the surrounding template instead. eText stays in the
	// template (hidden) because AG Grid still writes to it, and the sort/filter
	// refs stay because the component looks them up unconditionally.
	_headerTemplate(title) {
		if (typeof title !== "string" || !/<[a-z][\s\S]*>/i.test(title)) {
			return null;
		}
		return (
			'<div class="ag-cell-label-container" role="presentation">' +
			'<span ref="eMenu" class="ag-header-icon ag-header-cell-menu-button" aria-hidden="true"></span>' +
			'<div ref="eLabel" class="ag-header-cell-label" role="presentation">' +
			'<span ref="eText" class="ag-header-cell-text" style="display:none"></span>' +
			'<span class="ag-header-cell-text">' +
			title +
			"</span>" +
			'<span ref="eFilter" class="ag-header-icon ag-header-label-icon ag-filter-icon" aria-hidden="true"></span>' +
			'<span ref="eSortOrder" class="ag-header-icon ag-header-label-icon ag-sort-order" aria-hidden="true"></span>' +
			'<span ref="eSortAsc" class="ag-header-icon ag-header-label-icon ag-sort-ascending-icon" aria-hidden="true"></span>' +
			'<span ref="eSortDesc" class="ag-header-icon ag-header-label-icon ag-sort-descending-icon" aria-hidden="true"></span>' +
			'<span ref="eSortNone" class="ag-header-icon ag-header-label-icon ag-sort-none-icon" aria-hidden="true"></span>' +
			"</div>" +
			"</div>"
		);
	}

	_htmlToText(html) {
		if (typeof html !== "string" || html === "") return "";
		if (!/[<&]/.test(html)) return html;
		const el = document.createElement("div");
		el.innerHTML = html;
		return (el.textContent || "").trim();
	}

	_numericCompare(valueA, valueB, isInverted) {
		const numA = this._parseNumeric(valueA);
		const numB = this._parseNumeric(valueB);

		if (numA !== null && numB !== null) {
			return numA - numB;
		}

		if (valueA === null || valueA === undefined || valueA === "") {
			return 1;
		}
		if (valueB === null || valueB === undefined || valueB === "") {
			return -1;
		}

		const strA = String(valueA).toLowerCase();
		const strB = String(valueB).toLowerCase();
		if (strA < strB) return -1;
		if (strA > strB) return 1;
		return 0;
	}

	_parseNumeric(value) {
		if (value === null || value === undefined || value === "") {
			return null;
		}
		if (typeof value === "number") {
			return value;
		}
		const str = String(value).trim().replace(/,/g, "");
		if (str === "") return null;

		// isNaN(Number(str)), not Number.isNaN(str): the coercion is the point.
		// Number.isNaN would answer false for every string, numeric or not.
		if (!isNaN(Number(str))) {
			const num = parseFloat(str);
			if (isFinite(num)) {
				return num;
			}
		}
		return null;
	}

	// --- editable-grid support (opt-in via options.omnidbEditable) ---------
	//
	// Handsontable let a grid be written to; AG Grid needs each piece wired up
	// explicitly. The four below reproduce the parts edit_data.js depends on:
	// per-cell renderers and read-only flags from the `cells` callback, the
	// `beforeChange` hook, and `minSpareRows`' trailing blank row.

	// Handsontable called options.cells(row, col, prop) for every cell and used
	// the returned object's `renderer` and `readOnly`. Renderers read
	// `cellProperties.__proto__.type`, which on a plain object is simply
	// undefined — the same "not a dropdown, not a checkbox" answer Handsontable
	// gave for an untyped cell.
	_cellProperties(row, col) {
		if (typeof this.options.cells !== "function") return {};
		return this.options.cells.call(this, row, col, col) || {};
	}

	_renderCell(params, colIndex) {
		const props = this._cellProperties(params.node.rowIndex, colIndex);

		// The renderers assign to td.className outright, so they get their own
		// element to own rather than AG Grid's cell, whose classes carry the
		// grid's own layout. The state classes (cellEdit/cellNew/cellRemove/
		// cellReadOnly) only set colours, so a filling child renders the same.
		const td = document.createElement("div");
		td.style.width = "100%";
		td.style.height = "100%";

		const renderer = typeof props.renderer === "function" ? props.renderer : null;
		if (renderer) {
			renderer.call(this, this, td, params.node.rowIndex, colIndex, colIndex, params.value, props);
		} else {
			td.textContent = params.value == null ? "" : String(params.value);
		}

		// deleteRowEditData() reads getSelected() to find out which row's "×"
		// was clicked, and that icon carries an inline onclick. mousedown lands
		// before click, so selecting here guarantees the handler sees its own
		// row even if AG Grid's own click-to-select has not run yet.
		if (this._editable) {
			td.addEventListener("mousedown", function () {
				if (params.node && typeof params.node.setSelected === "function") {
					params.node.setSelected(true, true);
				}
			});
		}

		return td;
	}

	_applyCellEdit(params, colIndex) {
		const field = "col_" + colIndex;
		const oldValue = params.data[field];
		const newValue = params.newValue;
		if (oldValue === newValue) return false;

		if (typeof this.options.beforeChange === "function") {
			// [[row, col, oldValue, newValue]], Handsontable's shape.
			this.options.beforeChange.call(this, [[params.node.rowIndex, colIndex, oldValue, newValue]], "edit");
		}
		params.data[field] = newValue;

		// After the hook, the row's mode may have changed (a spare row becomes
		// an insert, an untouched row becomes an update), which changes both
		// its colour and its row-action icon — and consuming the spare row
		// means a fresh one is due. Deferred so it does not run inside AG
		// Grid's own edit-commit pass.
		const self = this;
		const node = params.node;
		setTimeout(function () {
			self._ensureSpareRow();
			if (self.gridApi) {
				self.gridApi.refreshCells({ force: true, rowNodes: [node] });
			}
		}, 0);

		return true;
	}

	_isEmptyRow(row) {
		if (!row) return true;
		for (let i = 0; i < row.length; i++) {
			const v = row[i];
			if (v !== null && v !== undefined && v !== "") return false;
		}
		return true;
	}

	_rowWidth() {
		if (this.gridOptions && this.gridOptions.columnDefs) return this.gridOptions.columnDefs.length;
		return (this.options.columns || []).length;
	}

	_withSpareRows(data) {
		const rows = (data || []).slice();
		for (let i = 0; i < this._minSpareRows; i++) {
			rows.push(new Array(this._rowWidth()).fill(null));
		}
		return rows;
	}

	// loadData() is handed the grid's own current contents by callers that
	// splice a row out and reload (deleteRowEditData), so the spare row comes
	// back in with it and would accumulate. Trailing blank rows are dropped
	// before _withSpareRows adds exactly one back. A genuine all-empty row
	// would be dropped too, but every editable table here has a primary key,
	// so no such row can exist.
	_stripTrailingEmptyRows(data) {
		if (!this._minSpareRows) return data || [];
		const rows = (data || []).slice();
		while (rows.length > 0 && this._isEmptyRow(rows[rows.length - 1])) {
			rows.pop();
		}
		return rows;
	}

	_ensureSpareRow() {
		if (!this._minSpareRows || !this.gridApi) return;
		const rows = this.getSourceData();
		if (rows.length > 0 && this._isEmptyRow(rows[rows.length - 1])) return;

		const blank = { rowIndex: rows.length };
		for (let i = 0; i < this._rowWidth(); i++) {
			blank["col_" + i] = null;
		}
		this.gridApi.applyTransaction({ add: [blank] });
	}

	// AG Grid hands back whatever is in the row model; the save path wants
	// plain strings or null so the Go side's []*string sees a real JSON null
	// for an empty cell rather than the string "undefined".
	_normalizeCellValue(value) {
		if (value === undefined || value === null || value === "") return null;
		return typeof value === "string" ? value : String(value);
	}

	_createRowData(data) {
		if (!data || data.length === 0) return [];
		return data.map((row, rowIndex) => {
			const rowObj = { rowIndex: rowIndex };
			row.forEach((value, colIndex) => {
				rowObj["col_" + colIndex] = value;
			});
			return rowObj;
		});
	}

	getSourceData() {
		const rows = [];
		if (this.gridApi) {
			this.gridApi.forEachNode((node) => {
				if (node.data) {
					const row = [];
					const colCount = this.gridOptions.columnDefs.length;
					for (let i = 0; i < colCount; i++) {
						row.push(node.data["col_" + i]);
					}
					rows.push(row);
				}
			});
		}
		return rows;
	}

	getData() {
		return this.getSourceData();
	}

	loadData(data) {
		if (this.gridApi) {
			this.gridApi.setRowData(this._createRowData(this._withSpareRows(this._stripTrailingEmptyRows(data))));
			setTimeout(() => {
				this._smartSizeColumns();
			}, 150);
		}
	}

	getDataAtCell(row, col) {
		if (this.gridApi) {
			const rowNode = this.gridApi.getDisplayedRowAtIndex(row);
			if (rowNode && rowNode.data) {
				return rowNode.data["col_" + col];
			}
		}
		return null;
	}

	// Handsontable's getDataAtRow(row) — the whole row as a plain array, in
	// column order. saveEditData() builds v_data_rows out of these, and the
	// backend indexes them as dataRow[col+1] (column 0 is the row-action
	// column), so the leading cell has to stay in.
	getDataAtRow(row) {
		if (!this.gridApi) return [];
		const rowNode = this.gridApi.getDisplayedRowAtIndex(row);
		if (!rowNode || !rowNode.data) return [];
		const out = [];
		const colCount = (this.gridOptions.columnDefs || []).length;
		for (let i = 0; i < colCount; i++) {
			out.push(this._normalizeCellValue(rowNode.data["col_" + i]));
		}
		return out;
	}

	getSelected() {
		if (this.gridApi) {
			const nodes = this.gridApi.getSelectedNodes();
			if (nodes.length > 0) {
				// The live display index, not the rowIndex baked into the row
				// data at load time — deleteRowEditData() uses this to index
				// infoRows[], which is re-indexed by every splice.
				const index = typeof nodes[0].rowIndex === "number" ? nodes[0].rowIndex : nodes[0].data.rowIndex;
				return [[index]];
			}
		}
		return [];
	}

	setDataAtCell(row, col, value) {
		if (this.gridApi) {
			const rowNode = this.gridApi.getDisplayedRowAtIndex(row);
			if (rowNode) {
				const newData = Object.assign({}, rowNode.data);
				newData["col_" + col] = value;
				this.gridApi.applyTransaction({ update: [newData] });
			}
		}
	}

	alter(action, index, amount) {
		if (this.gridApi && action === "remove_row") {
			const rowNode = this.gridApi.getDisplayedRowAtIndex(index);
			if (rowNode) {
				this.gridApi.applyTransaction({ remove: [rowNode.data] });
			}
		}
	}

	// force: true so custom cell renderers actually re-run. Without it AG Grid
	// skips any cell whose value is unchanged, and deleteRowEditData() toggles
	// a row's *mode* without touching a single value — the row would stay the
	// colour it was and keep the wrong row-action icon.
	render() {
		if (this.gridApi) {
			this.gridApi.refreshCells({ force: true });
		}
	}

	selectCell(row, col, endRow, endCol) {
		if (this.gridApi) {
			// setFocusedCell() is what schedules AG Grid's async "cellFocused" -> DOM .focus()
			// chain (see the suppressCellFocus comment in _initGrid); skip it for grids that
			// opted out, since gridOptions.suppressCellFocus alone only blocks *keyboard*-driven
			// focus, not this explicit API call.
			if (!this.options.suppressCellFocus) {
				this.gridApi.setFocusedCell(row, "col_" + col);
			}
			const rowNode = this.gridApi.getDisplayedRowAtIndex(row);
			if (rowNode) {
				rowNode.setSelected(true, true);
			}
		}
	}

	// Handsontable's deselectCell() clears the grid's own cell/row selection
	// (callers like autocomplete.js do selectCell() immediately followed by
	// deselectCell() just to focus/scroll a row into view without leaving
	// AG Grid's native selection highlight visible, since the app renders
	// its own selection highlighting separately). Missing this entirely
	// (rather than a no-op) made every caller throw a TypeError instead of
	// silently doing nothing.
	deselectCell() {
		if (this.gridApi) {
			this.gridApi.deselectAll();
			this.gridApi.clearFocusedCell();
		}
	}

	// Handsontable's getSettings().columns / updateSettings({columns}) pair,
	// used by callers that read a column's current width, tweak it, and
	// write it back (e.g. autocomplete.js sizing its result column to fit
	// the longest match). AG Grid keeps column width on the column state
	// rather than columnDefs, so read from getColumnState() and apply
	// through columnApi.setColumnWidth() rather than mutating columnDefs.
	getSettings() {
		if (!this.gridApi) return { columns: [] };
		const defs = this.gridOptions.columnDefs || [];
		const state = this.columnApi ? this.columnApi.getColumnState() : [];
		return {
			columns: defs.map((def, i) => {
				const field = def.field || "col_" + i;
				const colState = state.find((s) => s.colId === field);
				return { field: field, width: colState ? colState.width : def.width };
			}),
		};
	}

	updateSettings(settings) {
		if (!this.columnApi || !settings || !settings.columns) return;
		settings.columns.forEach((col, i) => {
			if (typeof col.width !== "number") return;
			const field = col.field || "col_" + i;
			this.columnApi.setColumnWidth(field, col.width);
		});
	}

	// Handsontable's getCell(row, col) returns the rendered <td>-equivalent
	// DOM node (or null if that row isn't currently rendered) so the caller
	// can toggle a CSS class on it directly. AG Grid's virtualized rows use
	// [row-index]/[col-id] attributes on its own .ag-row/.ag-cell elements,
	// one level shallower than a real <table> but with the same cell-then-
	// row parentNode relationship callers here rely on.
	getCell(row, col) {
		if (!this.gridApi) return null;
		const field = "col_" + col;
		const rowEl = this._gridDiv.querySelector('[row-index="' + row + '"]');
		if (!rowEl) return null;
		return rowEl.querySelector('[col-id="' + field + '"]');
	}

	destroy() {
		if (this._agGrid) {
			this._agGrid.destroy();
		}
		if (this._gridDiv && this._gridDiv.parentNode) {
			this._gridDiv.parentNode.removeChild(this._gridDiv);
		}
		if (this._mediaQueryListener && window.matchMedia) {
			window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", this._mediaQueryListener);
		}
		this._hideContextMenu();
	}

	getActive() {
		return this.gridApi !== null;
	}

	resize() {
		if (this.gridApi) {
			this._smartSizeColumns();
		}
	}

	getGridDiv() {
		return this._gridDiv;
	}

	_showContextMenu(event, params) {
		this._hideContextMenu();

		const menu = document.createElement("div");
		menu.className = "custom-context-menu";
		menu.style.left = event.clientX + "px";
		menu.style.top = event.clientY + "px";

		const items = this.options.contextMenu.items;
		const callback = this.options.contextMenu.callback;

		for (let key in items) {
			const item = items[key];
			const div = document.createElement("div");
			div.innerHTML = item.name; // item.name is trusted internal HTML (icons), not user input

			div.onclick = () => {
				this._hideContextMenu();
				let colIndex = parseInt(params.column.colId.replace("col_", ""));
				if (isNaN(colIndex)) colIndex = 0;
				let htOptions = [
					{
						start: { row: params.rowIndex, col: colIndex },
						end: { row: params.rowIndex, col: colIndex },
					},
				];
				if (callback) {
					callback.call(this, key, htOptions);
				}
			};
			menu.appendChild(div);
		}

		document.body.appendChild(menu);
		this._contextMenuElement = menu;

		const hideHandler = (e) => {
			if (!menu.contains(e.target)) {
				this._hideContextMenu();
				document.removeEventListener("click", hideHandler);
			}
		};
		setTimeout(() => document.addEventListener("click", hideHandler), 0);
	}

	_hideContextMenu() {
		if (this._contextMenuElement && this._contextMenuElement.parentNode) {
			this._contextMenuElement.parentNode.removeChild(this._contextMenuElement);
			this._contextMenuElement = null;
		}
	}
}

window.AgGridAdapter = AgGridAdapter;

window.Handsontable = function (container, options) {
	return new AgGridAdapter(container, options);
};

// Handsontable's built-in renderers, as much of them as renderers.js actually
// uses. Every renderer in that file ends with
//
//     Handsontable.renderers.<X>Renderer.apply(this, arguments);
//     td.className = "...";
//
// after having overwritten arguments[5] with what it wants displayed, so these
// have to write that sixth argument into the element. They were no-op stubs
// while the shim never invoked a renderer at all; the editable grid does (see
// AgGridAdapter._renderCell), and a stub there would render every cell blank.
function htmlRendererValue(value) {
	return value == null ? "" : value;
}

window.Handsontable.renderers = {
	// No <select> ever reaches here — the cellProperties this shim builds have
	// no `type`, so renderers.js takes its TextRenderer branch. Present because
	// those renderers name it in the branch they do not take.
	AutocompleteRenderer: function (instance, td, row, col, prop, value) {
		td.textContent = String(htmlRendererValue(value));
	},
	PasswordRenderer: function (instance, td, row, col, prop, value) {
		const text = String(htmlRendererValue(value));
		td.textContent = text.replace(/./g, "*");
	},
	CheckboxRenderer: function (instance, td, row, col, prop, value) {
		td.textContent = String(htmlRendererValue(value));
	},
	// innerHTML is the point of this one: the row-action renderers build an
	// <i> with an inline onclick, and the column headers a key icon. The markup
	// is composed in renderers.js from constants, never from row data.
	HtmlRenderer: function (instance, td, row, col, prop, value) {
		td.innerHTML = htmlRendererValue(value);
	},
	TextRenderer: function (instance, td, row, col, prop, value) {
		td.textContent = String(htmlRendererValue(value));
	},
};
