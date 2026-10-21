// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Turning a result grid into the data a chart needs. Pure functions.
/// </summary>

/** Most points drawn; a chart of more rows is unreadable and slow. */
export const MAX_POINTS = 500;

const NUMERIC_TYPE = /^(INT2|INT4|INT8|SMALLINT|INTEGER|BIGINT|TINYINT|MEDIUMINT|OID|INT|NUMERIC|DECIMAL|DEC|REAL|FLOAT|FLOAT4|FLOAT8|DOUBLE|MONEY|NUMBER|BINARY_FLOAT|BINARY_DOUBLE)\b/i;
const NUMBER_TEXT = /^\s*-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;

/**
 * @param {unknown} value
 * @returns {number | null} the value as a number, or null when it is not one (or NULL)
 */
export function toNumber(value) {
	if (value === null || value === undefined || value === "") return null;
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	const text = String(value);
	return NUMBER_TEXT.test(text) ? Number(text) : null;
}

/**
 * Which columns can be plotted as values: those whose database type is numeric
 * and, when the type is unknown, those where every non-empty cell reads as a
 * number.
 *
 * @param {Array<string | null> | null} types
 * @param {Array<Array<unknown>>} rows
 * @param {number} width
 * @returns {boolean[]}
 */
export function numericColumns(types, rows, width) {
	return Array.from({ length: width }, (_, i) => {
		const type = types && types[i];
		if (type && NUMERIC_TYPE.test(type)) return true;
		if (type) return false;
		let seen = 0;
		for (const row of rows) {
			const v = row[i];
			if (v === null || v === undefined || v === "") continue;
			if (toNumber(v) === null) return false;
			seen++;
		}
		return seen > 0;
	});
}

/**
 * @param {Array<Array<unknown>>} rows
 * @param {number} labelCol
 * @param {number[]} valueCols
 * @param {string[]} columnNames
 * @returns {{ labels: string[], datasets: Array<{ label: string, data: Array<number | null> }>, truncated: boolean }}
 */
export function buildChartData(rows, labelCol, valueCols, columnNames) {
	const shown = rows.slice(0, MAX_POINTS);
	return {
		labels: shown.map((row) => {
			const v = row[labelCol];
			return v === null || v === undefined ? "NULL" : String(v);
		}),
		datasets: valueCols.map((col) => ({
			label: columnNames[col],
			data: shown.map((row) => toNumber(row[col])),
		})),
		truncated: rows.length > MAX_POINTS,
	};
}

/**
 * Okabe-Ito: eight colours that stay distinguishable with common colour vision
 * deficiencies.
 */
export const PALETTE = ["#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7", "#56B4E9", "#F0E442", "#999999"];

/**
 * @param {number} index
 * @returns {string}
 */
export function paletteColor(index) {
	return PALETTE[index % PALETTE.length];
}
