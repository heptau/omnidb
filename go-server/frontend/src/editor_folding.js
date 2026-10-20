// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Statement-level code folding and a multi-cursor shortcut for the SQL editors.
/// Ace's SQL mode already folds brackets and block comments; this adds folding
/// of whole multi-line statements on top, which is what a script with several
/// long queries actually needs.
/// </summary>

/**
 * Finds every statement that spans more than one line.
 *
 * Statements are delimited by `;` outside of strings, quoted identifiers and
 * comments. A statement starts on the first line holding something other than
 * whitespace or comments, and ends on the line of its `;` (or on the last
 * non-blank line when the final statement has none).
 *
 * @param {string} text
 * @returns {Map<number, { endRow: number, endColumn: number }>} keyed by the statement's first row
 */
export function statementFoldRanges(text) {
	/** @type {Map<number, { endRow: number, endColumn: number }>} */
	const ranges = new Map();
	let state = "normal";
	let row = 0;
	let column = 0;
	let startRow = -1;
	let lastRow = -1;
	let lastColumn = 0;

	const close = (/** @type {number} */ endRow, /** @type {number} */ endColumn) => {
		if (startRow >= 0 && endRow > startRow) ranges.set(startRow, { endRow, endColumn });
		startRow = -1;
	};

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		const next = text[i + 1];
		if (ch === "\n") {
			if (state === "line_comment") state = "normal";
			row++;
			column = 0;
			continue;
		}
		const here = column;
		column++;

		if (state === "normal") {
			if (ch === "-" && next === "-") {
				state = "line_comment";
			} else if (ch === "/" && next === "*") {
				state = "block_comment";
				i++;
				column++;
			} else if (/\s/.test(ch)) {
				// whitespace never starts a statement
			} else {
				if (startRow < 0) startRow = row;
				lastRow = row;
				lastColumn = here + 1;
				if (ch === "'") state = "single";
				else if (ch === '"') state = "double";
				else if (ch === ";") close(row, here + 1);
			}
		} else if (state === "single") {
			lastRow = row;
			lastColumn = here + 1;
			if (ch === "'") state = "normal";
		} else if (state === "double") {
			lastRow = row;
			lastColumn = here + 1;
			if (ch === '"') state = "normal";
		} else if (state === "block_comment") {
			if (ch === "*" && next === "/") {
				state = "normal";
				i++;
				column++;
			}
		}
	}
	// Final statement without a terminating `;`.
	close(lastRow, lastColumn);
	return ranges;
}

/**
 * Adds statement folding to an Ace editor running in SQL mode, and the
 * DataGrip-style Alt+J multi-cursor shortcut. Brackets and block comments keep
 * folding as before; a row that starts a multi-line statement folds the whole
 * statement instead of whatever bracket happens to open on that row.
 *
 * @param {any} editor an Ace editor instance
 */
export function installEditorFolding(editor) {
	const session = editor.session;
	/** @type {Map<number, { endRow: number, endColumn: number }> | null} */
	let cache = null;
	session.on("change", () => {
		cache = null;
	});
	const ranges = () => (cache ??= statementFoldRanges(session.getValue()));

	const apply = () => {
		const base = session.getMode().foldingRules;
		if (!base || base.$omnidbStatements) return;
		const Range = ace.require("ace/range").Range;
		const wrapper = {
			$omnidbStatements: true,
			getFoldWidget(/** @type {any} */ s, /** @type {string} */ style, /** @type {number} */ row) {
				return ranges().has(row) ? "start" : base.getFoldWidget(s, style, row);
			},
			getFoldWidgetRange(/** @type {any} */ s, /** @type {string} */ style, /** @type {number} */ row, /** @type {boolean} */ forceMultiline) {
				const stmt = ranges().get(row);
				if (stmt) return new Range(row, s.getLine(row).length, stmt.endRow, stmt.endColumn);
				return base.getFoldWidgetRange(s, style, row, forceMultiline);
			},
		};
		session.$setFolding(wrapper);
	};
	apply();
	session.on("changeMode", apply);

	// DataGrip: Alt+J selects the next occurrence of the word under the cursor.
	editor.commands.bindKey("Alt-J", "selectMoreAfter");
	editor.commands.bindKey("Alt-Shift-J", "selectMoreBefore");
}
