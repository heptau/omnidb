// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Line diff for the editor's local history: what changed between a saved
/// version and the text now in the editor.
/// </summary>

/** @typedef {{ type: " " | "+" | "-", text: string }} DiffLine */
/** @typedef {DiffLine | { type: "gap", count: number }} DiffItem */

/** Above this many cells the exact diff is skipped for a coarse one. */
const MAX_CELLS = 4_000_000;

/**
 * Line-by-line diff (longest common subsequence). Common leading and trailing
 * lines are stripped first, which keeps typical edits cheap; a pathological
 * pair of huge texts falls back to "everything in the middle replaced".
 *
 * @param {string} before
 * @param {string} after
 * @returns {DiffLine[]}
 */
export function diffLines(before, after) {
	const a = before.split("\n");
	const b = after.split("\n");
	let start = 0;
	while (start < a.length && start < b.length && a[start] === b[start]) start++;
	let endA = a.length;
	let endB = b.length;
	while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
		endA--;
		endB--;
	}
	/** @type {DiffLine[]} */
	const out = a.slice(0, start).map((text) => ({ type: " ", text }));
	const midA = a.slice(start, endA);
	const midB = b.slice(start, endB);

	if (midA.length * midB.length > MAX_CELLS) {
		for (const text of midA) out.push({ type: "-", text });
		for (const text of midB) out.push({ type: "+", text });
	} else if (midA.length === 0 || midB.length === 0) {
		for (const text of midA) out.push({ type: "-", text });
		for (const text of midB) out.push({ type: "+", text });
	} else {
		const n = midA.length;
		const m = midB.length;
		// lcs[i][j]: length of the common subsequence of midA[i..] and midB[j..].
		const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
		for (let i = n - 1; i >= 0; i--) {
			for (let j = m - 1; j >= 0; j--) {
				lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
			}
		}
		let i = 0;
		let j = 0;
		while (i < n && j < m) {
			if (midA[i] === midB[j]) {
				out.push({ type: " ", text: midA[i] });
				i++;
				j++;
			} else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
				out.push({ type: "-", text: midA[i++] });
			} else {
				out.push({ type: "+", text: midB[j++] });
			}
		}
		while (i < n) out.push({ type: "-", text: midA[i++] });
		while (j < m) out.push({ type: "+", text: midB[j++] });
	}
	for (const text of a.slice(endA)) out.push({ type: " ", text });
	return out;
}

/**
 * Replaces long runs of unchanged lines by a gap marker, keeping `context`
 * lines around every change.
 *
 * @param {DiffLine[]} lines
 * @param {number} context
 * @returns {DiffItem[]}
 */
export function collapseUnchanged(lines, context) {
	/** @type {DiffItem[]} */
	const out = [];
	let i = 0;
	while (i < lines.length) {
		if (lines[i].type !== " ") {
			out.push(lines[i++]);
			continue;
		}
		let j = i;
		while (j < lines.length && lines[j].type === " ") j++;
		const run = lines.slice(i, j);
		const atStart = i === 0;
		const atEnd = j === lines.length;
		const keepHead = atStart ? 0 : context;
		const keepTail = atEnd ? 0 : context;
		if (run.length > keepHead + keepTail + 1) {
			out.push(...run.slice(0, keepHead));
			out.push({ type: "gap", count: run.length - keepHead - keepTail });
			out.push(...run.slice(run.length - keepTail));
		} else {
			out.push(...run);
		}
		i = j;
	}
	return out;
}

/**
 * @param {DiffLine[]} lines
 * @returns {boolean} whether the two texts differ at all
 */
export function hasChanges(lines) {
	return lines.some((l) => l.type !== " ");
}
