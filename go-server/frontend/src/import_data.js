// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Import wizard: "Import data…" on a table's context menu reads a CSV / JSON
/// file in the browser, lets the user map its columns onto the table's and
/// sends the rows to /import_rows/, which inserts them in one transaction.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";
import { t } from "./i18n.js";
import { buildImportPayload, detectDelimiter, parseCSV, parseJSONRows, suggestMapping } from "./import_parse.js";
import { setMessageModalTitle, showAlert, showConfirm } from "./notification_control.js";

const PREVIEW_ROWS = 3;

/**
 * Database errors arrive as { message, ... } rather than a bare string.
 * @param {{ v_data: any }} p_return
 */
function showRequestError(p_return) {
	var v_data = p_return.v_data;
	showAlert(typeof v_data === "string" ? v_data : (v_data && v_data.message) || t("errors.request_error"));
}

/**
 * @typedef {{ fileColumns: string[] | null, width: number, rows: Array<Array<string | null>> }} ParsedFile
 */

/**
 * Parses file text according to the chosen options.
 * @param {string} text
 * @param {string} fileName
 * @param {{ delimiter: string, header: boolean }} options delimiter "auto" or one character
 * @returns {ParsedFile}
 */
function parseFile(text, fileName, options) {
	if (/\.json$/i.test(fileName) || /^\s*[[{]/.test(text)) {
		const parsed = parseJSONRows(text);
		const width = parsed.columns ? parsed.columns.length : Math.max(0, ...parsed.rows.map((r) => r.length));
		return { fileColumns: parsed.columns, width, rows: parsed.rows };
	}
	const delimiter = options.delimiter === "auto" ? detectDelimiter(text) : options.delimiter;
	const all = parseCSV(text, delimiter);
	const width = Math.max(0, ...all.map((r) => r.length));
	const rows = options.header ? all.slice(1) : all;
	return {
		fileColumns: options.header && all.length > 0 ? all[0].concat(Array(width - all[0].length).fill("")) : null,
		width,
		rows: rows.map((r) => r.concat(Array(width - r.length).fill(""))),
	};
}

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
	const e = document.createElement(tag);
	if (className) e.className = className;
	if (text !== undefined) e.textContent = text;
	return e;
}

/**
 * @param {string} p_table
 * @param {string} p_schema
 * @param {string[]} p_columns the table's column names (catalog form)
 */
function openWizard(p_table, p_schema, p_columns) {
	/** @type {ParsedFile | null} */
	let parsed = null;
	/** @type {string[]} */
	let mapping = [];
	let fileText = "";
	let fileName = "";

	const getImport = () => (parsed ? buildImportPayload(parsed.rows, mapping, emptyNull.checked) : null);

	const run = () => {
		const payload = getImport();
		if (!payload || payload.columns.length === 0) {
			showAlert(t("import.nothing"));
			return;
		}
		execAjax(
			"/import_rows/",
			JSON.stringify({
				p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
				p_tab_id: v_connTabControl.selectedTab.id,
				p_schema: p_schema,
				p_table: p_table,
				p_columns: payload.columns,
				p_rows: payload.rows,
			}),
			function (/** @type {{ v_data: { v_inserted: number } }} */ r) {
				showAlert(t("import.done", { count: r.v_data.v_inserted, table: p_table }));
			},
			showRequestError,
			"box",
			true,
		);
	};

	const fileInput = /** @type {HTMLInputElement} */ (el("input", "form-control mb-2"));
	fileInput.type = "file";
	fileInput.accept = ".csv,.tsv,.txt,.json,text/csv,application/json";
	fileInput.setAttribute("aria-label", t("import.file"));

	const delimiterSelect = /** @type {HTMLSelectElement} */ (el("select", "form-select form-select-sm"));
	for (const [value, key] of [
		["auto", "import.delim_auto"],
		[",", "import.delim_comma"],
		[";", "import.delim_semicolon"],
		["\t", "import.delim_tab"],
		["|", "import.delim_pipe"],
	]) {
		const o = /** @type {HTMLOptionElement} */ (el("option", undefined, t(key)));
		o.value = value;
		delimiterSelect.appendChild(o);
	}

	const checkbox = (/** @type {string} */ labelKey, /** @type {boolean} */ checked) => {
		const wrap = el("div", "form-check form-check-inline");
		const input = /** @type {HTMLInputElement} */ (el("input", "form-check-input"));
		input.type = "checkbox";
		input.checked = checked;
		input.id = "import_opt_" + labelKey.replace(/\W/g, "_");
		const label = /** @type {HTMLLabelElement} */ (el("label", "form-check-label", t(labelKey)));
		label.htmlFor = input.id;
		wrap.append(input, label);
		return { wrap, input };
	};
	const header = checkbox("import.header", true);
	const emptyNullBox = checkbox("import.empty_null", true);
	const emptyNull = emptyNullBox.input;

	const status = el("div", "my-2");
	const table = el("div", "mt-2");
	table.style.maxHeight = "45vh";
	table.style.overflow = "auto";

	const render = () => {
		table.innerHTML = "";
		status.textContent = "";
		status.classList.remove("text-danger");
		if (!fileText) return;
		try {
			parsed = parseFile(fileText, fileName, { delimiter: delimiterSelect.value, header: header.input.checked });
		} catch (e) {
			parsed = null;
			status.classList.add("text-danger");
			status.textContent = t("import.parse_error", { error: e instanceof Error ? e.message : String(e) });
			return;
		}
		if (mapping.length !== parsed.width) mapping = suggestMapping(parsed.fileColumns, parsed.width, p_columns);
		status.textContent = t("import.rows_found", { count: parsed.rows.length });

		const grid = el("table", "table table-sm mb-0");
		grid.style.setProperty("--bs-table-bg", "transparent");
		grid.style.setProperty("--bs-table-color", "inherit");
		const head = el("tr");
		const sel = el("tr");
		for (let i = 0; i < parsed.width; i++) {
			head.appendChild(el("th", undefined, parsed.fileColumns ? parsed.fileColumns[i] || "#" + (i + 1) : "#" + (i + 1)));
			const cell = el("td");
			const select = /** @type {HTMLSelectElement} */ (el("select", "form-select form-select-sm"));
			select.setAttribute("aria-label", t("import.col_target"));
			const skip = /** @type {HTMLOptionElement} */ (el("option", undefined, t("import.map_skip")));
			skip.value = "";
			select.appendChild(skip);
			for (const c of p_columns) {
				const o = /** @type {HTMLOptionElement} */ (el("option", undefined, c));
				o.value = c;
				select.appendChild(o);
			}
			select.value = mapping[i] || "";
			select.addEventListener("change", () => {
				mapping[i] = select.value;
			});
			cell.appendChild(select);
			sel.appendChild(cell);
		}
		const thead = el("thead");
		thead.append(head, sel);
		const tbody = el("tbody");
		for (const row of parsed.rows.slice(0, PREVIEW_ROWS)) {
			const tr = el("tr");
			for (let i = 0; i < parsed.width; i++) {
				const v = row[i];
				const td = el("td", v === null || v === undefined ? "text-muted fst-italic" : "", v === null || v === undefined ? "NULL" : v);
				td.style.maxWidth = "14rem";
				td.style.overflow = "hidden";
				td.style.textOverflow = "ellipsis";
				td.style.whiteSpace = "nowrap";
				tr.appendChild(td);
			}
			tbody.appendChild(tr);
		}
		grid.append(thead, tbody);
		table.appendChild(grid);
	};

	fileInput.addEventListener("change", async () => {
		const file = fileInput.files && fileInput.files[0];
		if (!file) return;
		fileName = file.name;
		fileText = await file.text();
		mapping = [];
		render();
	});
	delimiterSelect.addEventListener("change", () => {
		mapping = [];
		render();
	});
	header.input.addEventListener("change", () => {
		mapping = [];
		render();
	});

	showConfirm(
		"",
		run,
		null,
		function () {
			setMessageModalTitle(t("import.title", { table: p_table }), "fas node-all fa-file-import");
			const content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));
			content.style.whiteSpace = "normal";
			content.innerHTML = "";
			const options = el("div", "d-flex flex-wrap align-items-center gap-2");
			const delimiterLabel = el("label", "me-1", t("import.delimiter"));
			options.append(delimiterLabel, delimiterSelect, header.wrap, emptyNullBox.wrap);
			delimiterSelect.style.width = "auto";
			content.append(fileInput, options, status, table);
		},
		"form",
		t("import.run"),
	);
}

/**
 * Starts the wizard for a table node of the connection tab's tree.
 * @param {any} p_node an aimaraJS tree node (text = table, tag.schema = schema)
 */
export function startImport(p_node) {
	const schema = (p_node.tag && p_node.tag.schema) || "";
	execAjax(
		"/start_edit_data/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: p_node.text,
			p_schema: schema,
		}),
		function (/** @type {{ v_data: { v_cols: Array<{ v_column: string }> } }} */ r) {
			openWizard(
				p_node.text,
				schema,
				r.v_data.v_cols.map((c) => c.v_column),
			);
		},
		showRequestError,
		"box",
		false,
	);
}

/**
 * Adds "Import data…" to the table menu of an engine's tree menus; call it on
 * the context_menu object before createTree().
 * @param {any} p_context_menu
 */
export function addImportMenu(p_context_menu) {
	var v_menu = p_context_menu.cm_table;
	if (!v_menu || !v_menu.elements) return;
	v_menu.elements.push({
		text: t("import.menu"),
		icon: "fas cm-all fa-file-import",
		action: startImport,
	});
}
