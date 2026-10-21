// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Reading CSV / JSON files for the table import wizard (import_data.js).
/// Pure functions: text in, rows out.
/// </summary>

/**
 * Parses delimiter-separated text (RFC 4180: quoted fields, "" for a quote,
 * newlines inside quotes). Completely empty lines are dropped.
 *
 * @param {string} text
 * @param {string} delimiter a single character
 * @returns {string[][]}
 */
export function parseCSV(text, delimiter) {
	if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
	/** @type {string[][]} */
	const rows = [];
	/** @type {string[]} */
	let row = [];
	let field = "";
	let inQuotes = false;
	let fieldStarted = false;

	const endField = () => {
		row.push(field);
		field = "";
		fieldStarted = false;
	};
	const endRow = () => {
		endField();
		if (!(row.length === 1 && row[0] === "")) rows.push(row);
		row = [];
	};

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
			}
		} else if (ch === '"' && !fieldStarted) {
			inQuotes = true;
			fieldStarted = true;
		} else if (ch === delimiter) {
			endField();
		} else if (ch === "\r" || ch === "\n") {
			if (ch === "\r" && text[i + 1] === "\n") i++;
			endRow();
		} else {
			field += ch;
			fieldStarted = true;
		}
	}
	if (field !== "" || fieldStarted || row.length > 0) endRow();
	return rows;
}

/**
 * Picks the delimiter that occurs most in the first line outside quotes.
 * @param {string} text
 * @returns {string}
 */
export function detectDelimiter(text) {
	const counts = { ",": 0, ";": 0, "\t": 0, "|": 0 };
	let inQuotes = false;
	for (const ch of text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) {
		if (ch === '"') inQuotes = !inQuotes;
		else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
		else if (!inQuotes && ch in counts) counts[/** @type {"," | ";" | "\t" | "|"} */ (ch)]++;
	}
	let best = ",";
	let bestCount = 0;
	for (const [delim, count] of Object.entries(counts)) {
		if (count > bestCount) {
			best = delim;
			bestCount = count;
		}
	}
	return best;
}

/**
 * @param {unknown} value
 * @returns {string | null} NULL stays null, everything else becomes text
 */
function jsonCell(value) {
	if (value === null || value === undefined) return null;
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

/**
 * Reads a JSON file holding an array of objects (columns = the keys, in order of
 * first appearance) or an array of arrays (no column names).
 *
 * @param {string} text
 * @returns {{ columns: string[] | null, rows: Array<Array<string | null>> }}
 * @throws {Error} when the text is not JSON or not an array of objects / arrays
 */
export function parseJSONRows(text) {
	const data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
	if (!Array.isArray(data)) throw new Error("expected a JSON array");
	if (data.length === 0) return { columns: null, rows: [] };
	if (data.every((item) => Array.isArray(item))) {
		return { columns: null, rows: data.map((item) => item.map(jsonCell)) };
	}
	if (data.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
		/** @type {string[]} */
		const columns = [];
		for (const item of data) {
			for (const key of Object.keys(item)) if (!columns.includes(key)) columns.push(key);
		}
		return { columns, rows: data.map((item) => columns.map((c) => jsonCell(item[c]))) };
	}
	throw new Error("expected an array of objects or of arrays");
}

/**
 * Suggests a table column for each file column: by name (ignoring case and
 * non-alphanumerics) when the file has names, otherwise by position.
 *
 * @param {string[] | null} fileColumns names from the header, or null without one
 * @param {number} width number of file columns
 * @param {string[]} tableColumns
 * @returns {string[]} per file column, the table column or "" for none
 */
export function suggestMapping(fileColumns, width, tableColumns) {
	const norm = (/** @type {string} */ s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
	const taken = new Set();
	return Array.from({ length: width }, (_, i) => {
		let target = "";
		if (fileColumns) {
			target = tableColumns.find((c) => norm(c) === norm(fileColumns[i] || "") && norm(c) !== "" && !taken.has(c)) || "";
		} else {
			target = tableColumns[i] && !taken.has(tableColumns[i]) ? tableColumns[i] : "";
		}
		if (target) taken.add(target);
		return target;
	});
}

/**
 * The rows to send: only the mapped columns, empty strings optionally as NULL.
 *
 * @param {Array<Array<string | null>>} rows
 * @param {string[]} mapping per file column, the table column or ""
 * @param {boolean} emptyAsNull
 * @returns {{ columns: string[], rows: Array<Array<string | null>> }}
 */
export function buildImportPayload(rows, mapping, emptyAsNull) {
	const picked = mapping.map((target, index) => ({ target, index })).filter((m) => m.target !== "");
	return {
		columns: picked.map((m) => m.target),
		rows: rows.map((row) =>
			picked.map((m) => {
				const value = row[m.index];
				if (value === null || value === undefined) return null;
				return emptyAsNull && value === "" ? null : value;
			}),
		),
	};
}
