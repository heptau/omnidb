/*
 * AG Grid Adapter - Provides Handsontable-like API for AG Grid v28
 * This adapter maps Handsontable API calls to AG Grid API
 */

class AgGridAdapter {
	constructor(container, options) {
		this.container = container;
		this.options = options || {};
		this.gridApi = null;
		this.gridOptions = null;

		this._initGrid();
	}

	_initGrid() {
		const self = this;

		let columns = this.options.columns || [];
		const data = this.options.data || [];

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
			sortable: true,
			resizable: true,
			filter: false,
			editable: false,
		},
			rowSelection: "single",
			animateRows: false,
			rowHeight: 28,
			headerHeight: 28,

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

		this._gridDiv = document.createElement("div");
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
		return columns.map((col, index) => {
			const colDef = {
				field: "col_" + index,
				headerName: col.title || "Column " + (index + 1),
				width: col.width || 120,
				resizable: true,
				sortable: true,
				headerTooltip: col.tooltip || col.title || "Column " + (index + 1),
				comparator: function (valueA, valueB, nodeA, nodeB, isInverted) {
					return self._numericCompare(valueA, valueB, isInverted);
				},
			};

			if (col.pinned) {
				colDef.pinned = col.pinned;
			}

			if (col.align) {
				colDef.cellStyle = { textAlign: col.align };
			}

			if (col.renderer === "html") {
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

		if (!isNaN(str)) {
			const num = parseFloat(str);
			if (isFinite(num)) {
				return num;
			}
		}
		return null;
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
			this.gridApi.setRowData(this._createRowData(data));
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

	getSelected() {
		if (this.gridApi) {
			const selectedRows = this.gridApi.getSelectedRows();
			if (selectedRows.length > 0) {
				return [[selectedRows[0].rowIndex]];
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

	render() {
		if (this.gridApi) {
			this.gridApi.refreshCells();
		}
	}

	selectCell(row, col, endRow, endCol) {
		if (this.gridApi) {
			this.gridApi.setFocusedCell(row, "col_" + col);
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

window.Handsontable.renderers = {
	AutocompleteRenderer: function () {},
	PasswordRenderer: function () {},
	CheckboxRenderer: function () {},
	HtmlRenderer: function () {},
	TextRenderer: function () {},
};
