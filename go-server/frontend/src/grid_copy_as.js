// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// "Copy as ..." formatters and column statistics for result-grid rows.
/// Pure functions only, so they stay trivially testable.
/// </summary>

/** @typedef {"insert" | "json" | "markdown" | "csv"} CopyFormat */

const NUMERIC_TYPE = /^(INT2|INT4|INT8|SMALLINT|INTEGER|BIGINT|TINYINT|MEDIUMINT|INT|NUMERIC|DECIMAL|DEC|REAL|FLOAT|FLOAT4|FLOAT8|DOUBLE|MONEY|NUMBER|BINARY_FLOAT|BINARY_DOUBLE)$/i;
const BOOL_TYPE = /^(BOOL|BOOLEAN)$/i;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isNull(value) {
	return value === null || value === undefined;
}

/**
 * @param {unknown} value
 * @param {string | null | undefined} type
 * @returns {string}
 */
function sqlLiteral(value, type) {
	if (isNull(value)) return "NULL";
	const text = String(value);
	if (type && NUMERIC_TYPE.test(type) && /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(text)) return text;
	if (type && BOOL_TYPE.test(type) && /^(true|false)$/i.test(text)) return text.toUpperCase();
	return "'" + text.replace(/'/g, "''") + "'";
}

/**
 * @param {string} name
 * @returns {string}
 */
function quoteIdentifier(name) {
	return /^[a-z_][a-z0-9_]*$/.test(name) ? name : '"' + name.replace(/"/g, '""') + '"';
}

/**
 * @param {unknown} value
 * @param {string} delimiter
 * @returns {string}
 */
function csvCell(value, delimiter) {
	if (isNull(value)) return "";
	const text = String(value);
	return text.includes(delimiter) || /["\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function markdownCell(value) {
	if (isNull(value)) return "";
	return String(value).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

/**
 * Formats the given rows in one of the supported "Copy as" formats.
 *
 * @param {CopyFormat} format
 * @param {string[]} columns
 * @param {Array<Array<unknown>>} rows
 * @param {Array<string | null> | null} [types] per-column database type names
 * @param {string | null} [tableName] target of the INSERT statements, as written in the source query
 * @returns {string}
 */
export function formatRows(format, columns, rows, types = null, tableName = null) {
	const typeAt = (/** @type {number} */ i) => (types && types[i]) || null;
	switch (format) {
		case "insert": {
			const cols = columns.map(quoteIdentifier).join(", ");
			return rows
				.map((row) => "INSERT INTO " + (tableName || "table_name") + " (" + cols + ") VALUES (" + row.map((v, i) => sqlLiteral(v, typeAt(i))).join(", ") + ");")
				.join("\n");
		}
		case "json":
			return JSON.stringify(
				rows.map((row) => Object.fromEntries(columns.map((c, i) => [c, isNull(row[i]) ? null : row[i]]))),
				null,
				2,
			);
		case "markdown": {
			const header = "| " + columns.map(markdownCell).join(" | ") + " |";
			const sep = "| " + columns.map(() => "---").join(" | ") + " |";
			const body = rows.map((row) => "| " + columns.map((_, i) => markdownCell(row[i])).join(" | ") + " |");
			return [header, sep, ...body].join("\n");
		}
		case "csv": {
			const header = columns.map((c) => csvCell(c, ",")).join(",");
			const body = rows.map((row) => columns.map((_, i) => csvCell(row[i], ",")).join(","));
			return [header, ...body].join("\n");
		}
		default:
			throw new Error("Unknown copy format: " + format);
	}
}

/**
 * Statistics over one column of the loaded result. `sum`/`avg`/`min`/`max`
 * are computed over the numeric values only and are null when there are none.
 *
 * @param {Array<Array<unknown>>} rows
 * @param {number} colIndex
 * @returns {{ count: number, nulls: number, distinct: number, numeric: number, sum: number | null, avg: number | null, min: number | null, max: number | null }}
 */
export function columnStats(rows, colIndex) {
	let nulls = 0;
	let numeric = 0;
	let sum = 0;
	let min = Infinity;
	let max = -Infinity;
	const distinct = new Set();
	for (const row of rows) {
		const value = row[colIndex];
		if (isNull(value) || value === "") {
			nulls++;
			continue;
		}
		distinct.add(String(value));
		const n = typeof value === "number" ? value : /^\s*-?\d+(\.\d+)?([eE][-+]?\d+)?\s*$/.test(String(value)) ? Number(value) : NaN;
		if (Number.isFinite(n)) {
			numeric++;
			sum += n;
			if (n < min) min = n;
			if (n > max) max = n;
		}
	}
	return {
		count: rows.length - nulls,
		nulls,
		distinct: distinct.size,
		numeric,
		sum: numeric ? sum : null,
		avg: numeric ? sum / numeric : null,
		min: numeric ? min : null,
		max: numeric ? max : null,
	};
}

const IDENT = '(?:"[^"]+"|`[^`]+`|\\[[^\\]]+\\]|[A-Za-z_][\\w$]*)';
const TABLE_REF = new RegExp("^select\\b[\\s\\S]*?\\bfrom\\s+(" + IDENT + "(?:\\s*\\.\\s*" + IDENT + "){0,2})\\s*(?:(?:as\\s+)?(?!(?:where|order|group|limit|having|offset|fetch|window|for)\\b)[A-Za-z_]\\w*\\s*)?(?:\\b(?:where|order|group|limit|having|offset|fetch|window|for)\\b[\\s\\S]*)?$", "i");

/**
 * Best-effort: the table a plain single-table SELECT reads from, exactly as it
 * was written (quoting and schema prefix kept), or null when the query is
 * anything more involved (joins, subqueries, set operations, CTEs, several
 * statements) and the source table is therefore ambiguous.
 *
 * @param {string | null | undefined} sql
 * @returns {string | null}
 */
export function guessSourceTable(sql) {
	if (!sql) return null;
	const flat = sql
		.replace(/'(?:[^']|'')*'/g, "''")
		.replace(/--[^\n]*/g, " ")
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.trim()
		.replace(/;\s*$/, "");
	if (flat.includes(";") || /\b(join|union|intersect|except|with)\b/i.test(flat)) return null;
	if ((flat.match(/\bfrom\b/gi) || []).length !== 1 || /\bfrom\s*\(/i.test(flat)) return null;
	const match = TABLE_REF.exec(flat.replace(/\s+/g, " "));
	return match ? match[1].replace(/\s*\.\s*/g, ".") : null;
}

/**
 * @param {unknown} text
 * @returns {string}
 */
function escapeHtmlText(text) {
	return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * One row as a vertical column / value table (the "record view"), as HTML for
 * the message modal. Everything user-controlled is escaped; NULL is shown as
 * an italic marker so it can't be mistaken for the text "null". The markup
 * contains no line breaks because the modal body renders them (pre-line).
 *
 * @param {string[]} columns
 * @param {Array<string | null> | null} types per-column database type names
 * @param {Array<unknown>} row
 * @param {string} nullLabel
 * @returns {string}
 */
export function recordViewHtml(columns, types, row, nullLabel) {
	const rows = columns.map((name, i) => {
		const value = row[i];
		const type = types && types[i] ? ' <small class="text-muted">' + escapeHtmlText(types[i]) + "</small>" : "";
		const cell = isNull(value)
			? "<i>" + escapeHtmlText(nullLabel) + "</i>"
			: '<span style="white-space:pre-wrap;word-break:break-word;">' + escapeHtmlText(value) + "</span>";
		return '<tr><th style="vertical-align:top;white-space:nowrap;padding-right:1rem;color:inherit;">' + escapeHtmlText(name) + type + '</th><td style="color:inherit;">' + cell + "</td></tr>";
	});
	return '<table class="table table-sm mb-0" style="width:100%;text-align:left;--bs-table-bg:transparent;--bs-table-color:inherit;--bs-table-striped-bg:transparent;color:inherit;">' + rows.join("") + "</table>";
}
