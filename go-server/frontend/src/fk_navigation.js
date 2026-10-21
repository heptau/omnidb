// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Foreign key navigation in the Edit Data grid: from a referencing row to
/// the row it points at. Pure helpers; edit_data.js does the DOM and requests.
/// </summary>

/**
 * @typedef {{ columns: string[], r_schema: string, r_table: string, r_columns: string[], r_columns_sql: string[] }} EditDataFK
 * @typedef {{ v_column: string, v_type: string }} EditDataColumn
 */

const NUMERIC_TYPE = /^(INT2|INT4|INT8|SMALLINT|INTEGER|BIGINT|TINYINT|MEDIUMINT|INT|NUMERIC|DECIMAL|DEC|REAL|FLOAT|FLOAT4|FLOAT8|DOUBLE|MONEY|NUMBER|BINARY_FLOAT|BINARY_DOUBLE)\b/i;

/** What Edit Data shows for a NULL cell. */
export const NULL_CELL = "[null]";

/**
 * @param {EditDataFK[]} fks
 * @param {string} columnName catalog-form column name
 * @returns {EditDataFK | null} the first foreign key the column is part of
 */
export function findForeignKey(fks, columnName) {
	return (fks || []).find((fk) => fk.columns.includes(columnName)) || null;
}

/**
 * @param {unknown} value
 * @param {string | null | undefined} type
 * @param {string} technology
 * @returns {string}
 */
function literal(value, type, technology) {
	const text = String(value);
	if (type && NUMERIC_TYPE.test(type) && /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(text.trim())) return text.trim();
	let escaped = text;
	if (technology === "mysql" || technology === "mariadb") escaped = escaped.replace(/\\/g, "\\\\");
	return "'" + escaped.replace(/'/g, "''") + "'";
}

/**
 * The WHERE/ORDER text for Edit Data on the referenced table, e.g.
 * `WHERE t.id = 7 AND t.region = 'EU'`.
 *
 * @param {EditDataFK} fk
 * @param {EditDataColumn[]} columns the referencing table's columns, in grid order
 * @param {Array<unknown>} row grid row, whose first cell is the action column
 * @param {string} technology
 * @returns {string | null} null when a key column of the row is NULL, so no row is referenced
 */
export function buildReferencedFilter(fk, columns, row, technology) {
	/** @type {string[]} */
	const conditions = [];
	for (let i = 0; i < fk.columns.length; i++) {
		const index = columns.findIndex((c) => c.v_column === fk.columns[i]);
		if (index < 0) return null;
		const value = row[index + 1];
		if (value === null || value === undefined || value === NULL_CELL) return null;
		conditions.push("t." + fk.r_columns_sql[i] + " = " + literal(value, columns[index].v_type, technology));
	}
	return "WHERE " + conditions.join(" AND ");
}
