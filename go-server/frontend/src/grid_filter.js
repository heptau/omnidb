// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Row filter for the result grid: the text typed in the filter box, as a
/// predicate over a row.
/// </summary>

/**
 * Every whitespace-separated term has to appear (case-insensitively) in at
 * least one cell of the row, so "eve 25" finds the row holding both. NULL
 * cells match the term "null".
 *
 * @param {string} text
 * @returns {((row: Array<unknown>) => boolean) | null} null when the text holds no term
 */
export function makeRowFilter(text) {
	const terms = text.toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return null;
	return (row) => {
		const cells = row.map((v) => (v === null || v === undefined ? "null" : String(v).toLowerCase()));
		return terms.every((term) => cells.some((cell) => cell.includes(term)));
	};
}
