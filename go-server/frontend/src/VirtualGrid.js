// @ts-check
/**
 * A small, dependency-free virtualized data table implementing the exact
 * Handsontable-shaped API this app's ~12 call sites already use (see the
 * method list at the bottom of this file) — this is the second
 * implementation of that same contract; AgGridAdapter.js was the first,
 * wrapping ag-grid-community (356KB gzip) behind it. Every real call site
 * was already going through that one narrow API (confirmed by grepping the
 * whole frontend for direct AG Grid API access — none exists outside that
 * adapter), so replacing the engine behind it needed no changes anywhere
 * else: same `new Handsontable(container, options)` constructor, same
 * `Handsontable.renderers.*` statics, same method names/signatures.
 *
 * Scope is deliberately the *actual* surface in use, not full Handsontable
 * parity: grepping every call site for which options AgGridAdapter actually
 * read off `this.options` (as opposed to passed-but-ignored legacy
 * Handsontable options like colHeaders/rowHeaders/stretchH/copyPaste/
 * fillHandle/manualColumnResize/tableClassName/disableVisualSelection —
 * none of those were ever implemented by the AG Grid adapter either, so
 * every grid in the app already runs without them) gives a short, closed
 * list: columns, data, cells, contextMenu, beforeChange, minSpareRows,
 * omnidbEditable, fixedColumnsLeft, suppressCellFocus. That list, plus
 * per-column title/width/tooltip/align/pinned/renderer, is everything
 * implemented here.
 *
 * Rendering strategy: a real <table> (so the app's existing Handsontable-era
 * CSS — `.handsontable th`, `.handsontable td`, `.cellEven/.cellNew/...` —
 * keeps applying unchanged, no scss touched), virtualized by windowing: only
 * the rows within the scrolled viewport (+ a small buffer) are ever actual
 * <tr> elements, with two spacer <tr>s (empty, height set to the total
 * height of the rows scrolled past above/below) standing in for the rest so
 * the scrollbar's size/position is correct. Row height is fixed (28px,
 * matching AG Grid's rowHeight config here), which is what makes computing
 * the visible range a single division rather than a binary search over
 * measured heights.
 */

const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 28;
const MIN_COL_WIDTH = 120;
const RENDER_BUFFER_ROWS = 8;

function htmlToText(html) {
	if (typeof html !== "string" || html === "") return "";
	if (!/[<&]/.test(html)) return html;
	const el = document.createElement("div");
	el.innerHTML = html;
	return (el.textContent || "").trim();
}

function parseNumeric(value) {
	if (value === null || value === undefined || value === "") return null;
	if (typeof value === "number") return value;
	const str = String(value).trim().replace(/,/g, "");
	if (str === "") return null;
	// isNaN(Number(str)), not Number.isNaN(str): the coercion is the point —
	// Number.isNaN would answer false for every string, numeric or not.
	if (!isNaN(Number(str))) {
		const num = parseFloat(str);
		if (isFinite(num)) return num;
	}
	return null;
}

function compareValues(valueA, valueB) {
	const numA = parseNumeric(valueA);
	const numB = parseNumeric(valueB);
	if (numA !== null && numB !== null) return numA - numB;

	if (valueA === null || valueA === undefined || valueA === "") return 1;
	if (valueB === null || valueB === undefined || valueB === "") return -1;

	const strA = String(valueA).toLowerCase();
	const strB = String(valueB).toLowerCase();
	if (strA < strB) return -1;
	if (strA > strB) return 1;
	return 0;
}

function isEmptyRow(row) {
	if (!row) return true;
	for (let i = 0; i < row.length; i++) {
		const v = row[i];
		if (v !== null && v !== undefined && v !== "") return false;
	}
	return true;
}

function normalizeCellValue(value) {
	if (value === undefined || value === null || value === "") return null;
	return typeof value === "string" ? value : String(value);
}

export class VirtualGrid {
	constructor(container, options) {
		this.container = container;
		this.options = options || {};

		this._editable = !!this.options.omnidbEditable;
		this._minSpareRows = this._editable ? this.options.minSpareRows || 0 : 0;
		this._suppressCellFocus = !!this.options.suppressCellFocus;

		/** @type {any[]} */
		this._rows = [];
		/** @type {number[]} */
		this._displayOrder = [];
		this._sortColIndex = -1;
		this._sortDir = 0; // 0 = unsorted, 1 = asc, -1 = desc
		this._selectedDisplay = -1;
		/** @type {any} */
		this._editingCell = null; // {display, colIndex, input, oldValue}
		this._renderedStart = -1;
		this._renderedEnd = -1;
		/** @type {Map<number, HTMLTableRowElement>} */
		this._rowEls = new Map(); // display index -> <tr>
		/** @type {HTMLElement | null} */
		this._contextMenuEl = null;
		/** @type {any} */
		this._resizing = null;
		/** @type {number | null} */
		this._rafHandle = null;

		// DOM scaffolding — built by _buildDom() below, declared here (typed
		// `any`, this class's state is not exposed to any other module) so
		// every method sees one definite type for each rather than tsc
		// inferring "possibly undefined" from a field only ever assigned
		// inside a method other than the constructor.
		/** @type {any} */
		this._scrollEl = null;
		/** @type {any} */
		this._table = null;
		/** @type {any} */
		this._colgroup = null;
		/** @type {any} */
		this._thead = null;
		/** @type {any} */
		this._headerRow = null;
		/** @type {any} */
		this._tbody = null;
		/** @type {any} */
		this._topSpacer = null;
		/** @type {any} */
		this._topSpacerCell = null;
		/** @type {any} */
		this._bottomSpacer = null;
		/** @type {any} */
		this._bottomSpacerCell = null;
		/** @type {any} */
		this._resizeObserver = null;
		/** @type {any} */
		this._onScroll = null;
		/** @type {any} */
		this._onDocMouseMove = null;
		/** @type {any} */
		this._onDocMouseUp = null;

		this._columns = this._normalizeColumns(this.options.columns || []);
		this._setRows(this._withSpareRows(this.options.data || []));

		this._buildDom();
		this._layoutColumns();
		this._renderNow();

		// Deferred: needs a laid-out container to know how much slack width
		// there is to distribute (mirrors AgGridAdapter's own setTimeout-ed
		// _smartSizeColumns after onGridReady/onFirstDataRendered).
		setTimeout(() => this._smartSizeColumns(), 100);
	}

	// --- column/row setup ---------------------------------------------------

	_normalizeColumns(columns) {
		const fixedLeft = this._editable ? this.options.fixedColumnsLeft || 0 : 0;
		return columns.map((col, index) => {
			const pinned = !!col.pinned || index < fixedLeft;
			return {
				title: col.title || "Column " + (index + 1),
				width: col.width || MIN_COL_WIDTH,
				tooltip: col.tooltip,
				align: col.align,
				pinned: pinned,
				renderer: col.renderer,
				readOnly: !!col.readOnly,
			};
		});
	}

	_rowWidth() {
		return this._columns.length;
	}

	_withSpareRows(data) {
		const rows = (data || []).slice();
		for (let i = 0; i < this._minSpareRows; i++) {
			rows.push(new Array(this._rowWidth()).fill(null));
		}
		return rows;
	}

	_stripTrailingEmptyRows(data) {
		if (!this._minSpareRows) return data || [];
		const rows = (data || []).slice();
		while (rows.length > 0 && isEmptyRow(rows[rows.length - 1])) {
			rows.pop();
		}
		return rows;
	}

	_setRows(rows) {
		this._rows = rows;
		this._displayOrder = rows.map((_, i) => i);
		if (this._sortColIndex >= 0) this._applySort();
	}

	_ensureSpareRow() {
		if (!this._minSpareRows) return;
		if (this._rows.length > 0 && isEmptyRow(this._rows[this._rows.length - 1])) return;
		this._rows.push(new Array(this._rowWidth()).fill(null));
		this._displayOrder.push(this._rows.length - 1);
	}

	// --- DOM scaffolding ------------------------------------------------------

	_buildDom() {
		this._scrollEl = document.createElement("div");
		this._scrollEl.className = "omnidb__virtual-grid__scroll";
		this._scrollEl.style.cssText = "position:relative;width:100%;height:100%;overflow:auto;";

		this._table = document.createElement("table");
		this._table.className = "handsontable omnidb__virtual-grid";
		this._table.style.cssText = "border-collapse:collapse;table-layout:fixed;width:100%;";

		this._colgroup = document.createElement("colgroup");
		this._table.appendChild(this._colgroup);

		this._thead = document.createElement("thead");
		this._headerRow = document.createElement("tr");
		this._thead.appendChild(this._headerRow);
		this._table.appendChild(this._thead);

		this._tbody = document.createElement("tbody");
		this._table.appendChild(this._tbody);

		// height:0 (not just padding/border/line-height) matters here: the
		// global `.handsontable td { height: 2rem }` rule sets an explicit
		// height on every td, which an empty spacer cell needs to override
		// directly -- setting the height on the <tr> alone isn't enough,
		// since the td's own explicit height still forces the row open. A
		// spacer meant to be 0px tall (nothing scrolled past above/below)
		// rendered as one extra blank row instead -- most visible as a gap
		// between the header and the first data row, since start=0 (the top
		// spacer) is 0px on essentially every render.
		this._topSpacer = document.createElement("tr");
		this._topSpacerCell = document.createElement("td");
		this._topSpacerCell.style.cssText = "padding:0;border:none;line-height:0;height:0;";
		this._topSpacer.appendChild(this._topSpacerCell);

		this._bottomSpacer = document.createElement("tr");
		this._bottomSpacerCell = document.createElement("td");
		this._bottomSpacerCell.style.cssText = "padding:0;border:none;line-height:0;height:0;";
		this._bottomSpacer.appendChild(this._bottomSpacerCell);

		this._tbody.appendChild(this._topSpacer);
		this._tbody.appendChild(this._bottomSpacer);

		this._buildHeader();

		this._scrollEl.appendChild(this._table);
		this.container.appendChild(this._scrollEl);

		this._onScroll = () => this._scheduleRender();
		this._scrollEl.addEventListener("scroll", this._onScroll);

		this._onDocMouseMove = (e) => this._onResizeMouseMove(e);
		this._onDocMouseUp = () => this._onResizeMouseUp();
		document.addEventListener("mousemove", this._onDocMouseMove);
		document.addEventListener("mouseup", this._onDocMouseUp);

		this._resizeObserver =
			typeof ResizeObserver !== "undefined"
				? new ResizeObserver(() => this._scheduleRender())
				: null;
		if (this._resizeObserver) this._resizeObserver.observe(this._scrollEl);
	}

	_buildHeader() {
		this._headerRow.innerHTML = "";
		this._columns.forEach((col, index) => {
			const th = document.createElement("th");
			th.style.cssText =
				"position:relative;height:" + HEADER_HEIGHT + "px;box-sizing:border-box;user-select:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
			th.innerHTML = col.title;
			const tooltipText = htmlToText(col.tooltip) || htmlToText(col.title);
			if (tooltipText) th.title = tooltipText;
			if (col.align) th.style.textAlign = col.align;

			if (!this._editable) {
				th.style.cursor = "pointer";
				th.addEventListener("click", (e) => {
					if (e.target && /** @type {HTMLElement} */ (e.target).dataset.omnidbResize) return;
					this._toggleSort(index);
				});
			}

			const handle = document.createElement("div");
			handle.dataset.omnidbResize = "1";
			handle.style.cssText =
				"position:absolute;top:0;right:0;width:6px;height:100%;cursor:col-resize;";
			handle.addEventListener("mousedown", (e) => this._onResizeMouseDown(e, index));
			th.appendChild(handle);

			this._headerRow.appendChild(th);
		});
		this._applySortIndicators();
	}

	_applySortIndicators() {
		Array.from(this._headerRow.children).forEach((th, index) => {
			/** @type {HTMLElement} */ (th).style.fontStyle = index === this._sortColIndex ? "italic" : "";
		});
	}

	// --- column widths / pinning ---------------------------------------------

	_layoutColumns() {
		this._colgroup.innerHTML = "";
		this._columns.forEach((col) => {
			const c = document.createElement("col");
			c.style.width = col.width + "px";
			this._colgroup.appendChild(c);
		});

		// A header cell needs top-stickiness always (frozen while the body
		// scrolls vertically) and left-stickiness too when pinned (frozen
		// while the body scrolls horizontally) — both offsets active on the
		// same element at once is what actually pins the top-left corner
		// column(s), not two separate passes.
		let cum = 0;
		Array.from(this._headerRow.children).forEach((th, index) => {
			const col = this._columns[index];
			const el = /** @type {HTMLElement} */ (th);
			el.style.position = "sticky";
			el.style.top = "0";
			el.style.zIndex = col.pinned ? "3" : "2";
			if (col.pinned) {
				el.style.left = cum + "px";
				cum += col.width;
			} else {
				el.style.left = "";
			}
		});

		this._renderedStart = -1; // force a full re-render, widths changed
		this._renderNow();
	}

	_smartSizeColumns() {
		if (this._columns.length === 0) return;
		const available = this._scrollEl.clientWidth;
		const totalMin = this._columns.reduce((sum, c) => sum + c.width, 0);
		const totalDefaultMin = this._columns.length * MIN_COL_WIDTH;
		if (totalDefaultMin > available) return; // not enough room — let horizontal scroll happen instead
		if (totalMin >= available) return;

		const extra = available - totalMin;
		const share = Math.floor(extra / this._columns.length);
		this._columns.forEach((c) => (c.width += share));
		this._layoutColumns();
	}

	// --- sorting ---------------------------------------------------------------

	_toggleSort(colIndex) {
		if (this._sortColIndex === colIndex) {
			this._sortDir = this._sortDir === 1 ? -1 : this._sortDir === -1 ? 0 : 1;
			if (this._sortDir === 0) this._sortColIndex = -1;
		} else {
			this._sortColIndex = colIndex;
			this._sortDir = 1;
		}
		this._applySort();
		this._applySortIndicators();
		this._renderedStart = -1;
		this._renderNow();
	}

	_applySort() {
		if (this._sortColIndex < 0) {
			this._displayOrder = this._rows.map((_, i) => i);
			return;
		}
		const col = this._sortColIndex;
		const dir = this._sortDir;
		this._displayOrder = this._rows.map((_, i) => i);
		this._displayOrder.sort((a, b) => dir * compareValues(this._rows[a][col], this._rows[b][col]));
	}

	// --- virtualized rendering ---------------------------------------------------

	// Scroll and resize fire far more often than the screen can usefully
	// redraw for, so those two go through here (coalesced to one _renderVisible
	// per animation frame). Everything else that changes what should be on
	// screen -- loadData, sort, edit, resize(), render() -- calls _renderNow()
	// instead: requestAnimationFrame is paused for backgrounded/non-visible
	// tabs, and a grid whose data just changed needs to actually reflect that
	// now, not "whenever this tab is next visible".
	_scheduleRender() {
		if (this._rafHandle) return;
		this._rafHandle = requestAnimationFrame(() => {
			this._rafHandle = null;
			this._renderVisible();
		});
	}

	_renderNow() {
		if (this._rafHandle) {
			cancelAnimationFrame(this._rafHandle);
			this._rafHandle = null;
		}
		this._renderVisible();
	}

	_renderVisible() {
		if (!this._scrollEl.isConnected) return;
		const total = this._displayOrder.length;
		const scrollTop = this._scrollEl.scrollTop;
		const viewportHeight = this._scrollEl.clientHeight || 400;

		let start = Math.floor(scrollTop / ROW_HEIGHT) - RENDER_BUFFER_ROWS;
		let end = Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + RENDER_BUFFER_ROWS;
		start = Math.max(0, start);
		end = Math.min(total, end);

		if (start === this._renderedStart && end === this._renderedEnd) return;
		this._renderedStart = start;
		this._renderedEnd = end;

		// Rebuild the rendered window. Simpler and, at the row counts this app
		// actually deals with (dozens to low thousands, never virtual-scroll's
		// original "infinite feed" scale), plenty fast — avoids the extra
		// bookkeeping a diff/reuse pass over the previous window would need for
		// marginal benefit here.
		Array.from(this._tbody.querySelectorAll("tr[data-omnidb-row]")).forEach((tr) => tr.remove());
		this._rowEls.clear();

		const frag = document.createDocumentFragment();
		for (let display = start; display < end; display++) {
			const tr = this._renderRow(display);
			frag.appendChild(tr);
			this._rowEls.set(display, tr);
		}
		this._tbody.insertBefore(frag, this._bottomSpacer);

		this._topSpacerCell.parentElement.style.height = start * ROW_HEIGHT + "px";
		this._bottomSpacerCell.parentElement.style.height = Math.max(0, total - end) * ROW_HEIGHT + "px";
	}

	_cellProperties(displayRow, col) {
		if (typeof this.options.cells !== "function") return {};
		return this.options.cells.call(this, displayRow, col, col) || {};
	}

	_renderRow(display) {
		const rowIndex = this._displayOrder[display];
		const row = this._rows[rowIndex];
		const tr = document.createElement("tr");
		tr.dataset.omnidbRow = "1";
		tr.style.height = ROW_HEIGHT + "px";
		if (display === this._selectedDisplay) tr.style.backgroundColor = "var(--omnidb-grid-selected-bg, #c7d6ff)";

		tr.addEventListener("mousedown", () => {
			this._selectDisplayRow(display);
		});
		tr.addEventListener("contextmenu", (e) => {
			if (this.options.contextMenu) {
				e.preventDefault();
				const td = /** @type {HTMLElement} */ (e.target).closest("td");
				const colIndex = td ? Array.from(tr.children).indexOf(td) : 0;
				this._showContextMenu(e, display, colIndex < 0 ? 0 : colIndex);
			}
		});

		let cum = 0;
		this._columns.forEach((col, colIndex) => {
			const td = document.createElement("td");
			td.style.cssText = "box-sizing:border-box;overflow:hidden;";
			if (col.pinned) {
				td.style.position = "sticky";
				td.style.left = cum + "px";
				td.style.zIndex = "1";
				// A pinned cell stays fixed on screen while the rest of its row
				// scrolls horizontally underneath it, so it needs an opaque
				// background (not "inherit", which resolves through the
				// transparent tr/tbody to nothing) or the scrolled-past cells'
				// text bleeds through visually.
				td.style.backgroundColor = this._pinnedCellBackground(display);
				cum += col.width;
			}
			if (col.align) td.style.textAlign = col.align;

			this._renderCellInto(td, display, colIndex, row[colIndex]);
			tr.appendChild(td);
		});
		return tr;
	}

	_renderCellInto(td, display, colIndex, value) {
		const props = this._cellProperties(display, colIndex);
		const col = this._columns[colIndex];

		if (this._editable) {
			const wrapper = document.createElement("div");
			wrapper.style.cssText = "width:100%;height:100%;";
			const renderer = typeof props.renderer === "function" ? props.renderer : null;
			if (renderer) {
				renderer.call(this, this, wrapper, display, colIndex, colIndex, value, props);
			} else {
				wrapper.textContent = value == null ? "" : String(value);
			}
			td.innerHTML = "";
			td.appendChild(wrapper);

			if (!props.readOnly) {
				td.style.cursor = "text";
				td.addEventListener("click", () => this._beginEdit(display, colIndex));
			}
			td.addEventListener("mousedown", () => this._selectDisplayRow(display));
			return;
		}

		if (col.renderer === "html") {
			td.innerHTML = value == null ? "" : String(value);
		} else {
			td.textContent = value == null ? "" : String(value);
		}
	}

	// Pinned cells can't just inherit the row's background (see _renderRow),
	// so selection state has to be pushed to them explicitly too whenever
	// it changes, not only at initial render.
	_pinnedCellBackground(display) {
		return display === this._selectedDisplay
			? "var(--omnidb-grid-selected-bg, #c7d6ff)"
			: "var(--omnidb-grid-row-bg, #fff)";
	}

	_restyleRowSelection(display) {
		const el = this._rowEls.get(display);
		if (!el) return;
		el.style.backgroundColor = display === this._selectedDisplay ? "var(--omnidb-grid-selected-bg, #c7d6ff)" : "";
		this._columns.forEach((col, colIndex) => {
			if (!col.pinned) return;
			const td = el.children[colIndex];
			if (td) /** @type {HTMLElement} */ (td).style.backgroundColor = this._pinnedCellBackground(display);
		});
	}

	_selectDisplayRow(display) {
		const prev = this._selectedDisplay;
		this._selectedDisplay = display;
		if (prev >= 0) this._restyleRowSelection(prev);
		this._restyleRowSelection(display);
	}

	// --- editing ---------------------------------------------------------------

	_beginEdit(display, colIndex) {
		if (this._editingCell) this._commitEdit();
		const tr = this._rowEls.get(display);
		if (!tr) return;
		const td = tr.children[colIndex];
		if (!td) return;

		const rowIndex = this._displayOrder[display];
		const currentValue = this._rows[rowIndex][colIndex];

		const input = document.createElement("input");
		input.type = "text";
		input.value = currentValue == null ? "" : String(currentValue);
		input.style.cssText = "width:100%;height:100%;box-sizing:border-box;border:none;outline:none;font:inherit;";

		td.innerHTML = "";
		td.appendChild(input);
		input.focus();
		input.select();

		this._editingCell = { display, colIndex, input, oldValue: currentValue };

		input.addEventListener("blur", () => this._commitEdit());
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				input.blur();
			} else if (e.key === "Escape") {
				this._editingCell = null;
				this._renderedStart = -1;
				this._renderNow();
			}
		});
	}

	_commitEdit() {
		const editing = this._editingCell;
		if (!editing) return;
		this._editingCell = null;

		const { display, colIndex, input, oldValue } = editing;
		const newValue = input.value;
		const rowIndex = this._displayOrder[display];

		if (oldValue !== newValue) {
			if (typeof this.options.beforeChange === "function") {
				this.options.beforeChange.call(this, [[display, colIndex, oldValue, newValue]], "edit");
			}
			this._rows[rowIndex][colIndex] = newValue;
			this._ensureSpareRow();
		}

		this._renderedStart = -1;
		this._renderNow();
	}

	// --- column resize ------------------------------------------------------------

	_onResizeMouseDown(e, colIndex) {
		e.preventDefault();
		e.stopPropagation();
		this._resizing = { colIndex, startX: e.clientX, startWidth: this._columns[colIndex].width };
	}

	_onResizeMouseMove(e) {
		if (!this._resizing) return;
		const delta = e.clientX - this._resizing.startX;
		const col = this._columns[this._resizing.colIndex];
		col.width = Math.max(30, this._resizing.startWidth + delta);
		this._layoutColumns();
	}

	_onResizeMouseUp() {
		this._resizing = null;
	}

	// --- context menu ------------------------------------------------------------

	_showContextMenu(event, display, colIndex) {
		this._hideContextMenu();

		const menu = document.createElement("div");
		menu.className = "custom-context-menu";
		menu.style.left = event.clientX + "px";
		menu.style.top = event.clientY + "px";

		const items = this.options.contextMenu.items;
		const callback = this.options.contextMenu.callback;

		for (const key in items) {
			const item = items[key];
			const div = document.createElement("div");
			div.innerHTML = item.name; // trusted internal HTML (icons), not user input

			div.onclick = () => {
				this._hideContextMenu();
				const htOptions = [{ start: { row: display, col: colIndex }, end: { row: display, col: colIndex } }];
				if (callback) callback.call(this, key, htOptions);
			};
			menu.appendChild(div);
		}

		document.body.appendChild(menu);
		this._contextMenuEl = menu;

		const hideHandler = (e) => {
			if (!menu.contains(e.target)) {
				this._hideContextMenu();
				document.removeEventListener("click", hideHandler);
			}
		};
		setTimeout(() => document.addEventListener("click", hideHandler), 0);
	}

	_hideContextMenu() {
		if (this._contextMenuEl && this._contextMenuEl.parentNode) {
			this._contextMenuEl.parentNode.removeChild(this._contextMenuEl);
			this._contextMenuEl = null;
		}
	}

	// --- public, Handsontable-shaped API ----------------------------------------

	getSourceData() {
		return this._displayOrder.map((rowIndex) => this._rows[rowIndex].slice());
	}

	getData() {
		return this.getSourceData();
	}

	loadData(data) {
		this._setRows(this._withSpareRows(this._stripTrailingEmptyRows(data)));
		this._selectedDisplay = -1;
		this._renderedStart = -1;
		this._renderNow();
		setTimeout(() => this._smartSizeColumns(), 150);
	}

	getDataAtCell(display, col) {
		const rowIndex = this._displayOrder[display];
		if (rowIndex === undefined) return null;
		const row = this._rows[rowIndex];
		return row ? row[col] : null;
	}

	getDataAtRow(display) {
		const rowIndex = this._displayOrder[display];
		if (rowIndex === undefined) return [];
		const row = this._rows[rowIndex] || [];
		return row.map((v) => normalizeCellValue(v));
	}

	getSelected() {
		if (this._selectedDisplay < 0) return [];
		return [[this._selectedDisplay]];
	}

	setDataAtCell(display, col, value) {
		const rowIndex = this._displayOrder[display];
		if (rowIndex === undefined) return;
		const oldValue = this._rows[rowIndex][col];
		if (oldValue === value) return;
		if (typeof this.options.beforeChange === "function") {
			this.options.beforeChange.call(this, [[display, col, oldValue, value]], "edit");
		}
		this._rows[rowIndex][col] = value;
		this._ensureSpareRow();
		this._renderedStart = -1;
		this._renderNow();
	}

	alter(action, index, amount) {
		if (action !== "remove_row") return;
		const rowIndex = this._displayOrder[index];
		if (rowIndex === undefined) return;
		this._rows.splice(rowIndex, 1);
		this._displayOrder = this._rows.map((_, i) => i);
		if (this._sortColIndex >= 0) this._applySort();
		this._renderedStart = -1;
		this._renderNow();
	}

	render() {
		this._renderedStart = -1;
		this._renderNow();
	}

	selectCell(row, col) {
		if (!this._suppressCellFocus) {
			// No real DOM focus is moved here on purpose — see
			// deselectCell()'s comment: callers pairing selectCell()+
			// deselectCell() only want the row's highlight/scroll-into-view,
			// same as the AG Grid adapter's suppressCellFocus opt-out did.
		}
		this._selectDisplayRow(row);
		const tr = this._rowEls.get(row);
		if (tr && tr.scrollIntoView) tr.scrollIntoView({ block: "nearest" });
	}

	deselectCell() {
		if (this._selectedDisplay >= 0) {
			const el = this._rowEls.get(this._selectedDisplay);
			if (el) el.style.backgroundColor = "";
		}
		this._selectedDisplay = -1;
	}

	getSettings() {
		return {
			columns: this._columns.map((c) => ({ width: c.width })),
		};
	}

	updateSettings(settings) {
		if (!settings || !settings.columns) return;
		settings.columns.forEach((col, i) => {
			if (typeof col.width !== "number" || !this._columns[i]) return;
			this._columns[i].width = col.width;
		});
		this._layoutColumns();
	}

	getCell(row, col) {
		const tr = this._rowEls.get(row);
		if (!tr) return null;
		return tr.children[col] || null;
	}

	destroy() {
		if (this._rafHandle) cancelAnimationFrame(this._rafHandle);
		if (this._resizeObserver) this._resizeObserver.disconnect();
		document.removeEventListener("mousemove", this._onDocMouseMove);
		document.removeEventListener("mouseup", this._onDocMouseUp);
		this._hideContextMenu();
		if (this._scrollEl && this._scrollEl.parentNode) {
			this._scrollEl.parentNode.removeChild(this._scrollEl);
		}
	}

	getActive() {
		return true;
	}

	resize() {
		this._smartSizeColumns();
		this._renderedStart = -1;
		this._renderNow();
	}

	getGridDiv() {
		return this._scrollEl;
	}
}

window.VirtualGrid = VirtualGrid;

window.Handsontable = function (container, options) {
	return new VirtualGrid(container, options);
};

// Handsontable's built-in renderers, as much of them as renderers.js actually
// uses — unchanged from the AG Grid adapter, since these only ever
// manipulate the `td` element handed to them, never anything grid-specific.
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
