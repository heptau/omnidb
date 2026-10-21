// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// JSON re-formatting for the cell content viewer. Works on the text itself
/// rather than through JSON.parse/stringify, so numbers (a 20-digit id, 1.0,
/// 1e5) and string escapes come out exactly as they went in -- a cell that is
/// saved back must not silently change value.
/// </summary>

/**
 * @param {string} text
 * @returns {boolean} whether the text is a single valid JSON value
 */
export function isJSONText(text) {
	if (!text || !text.trim()) return false;
	try {
		JSON.parse(text);
		return true;
	} catch {
		return false;
	}
}

/**
 * Re-indents (indent > 0) or minifies (indent = 0) JSON text, leaving every
 * string and scalar token untouched.
 *
 * @param {string} text
 * @param {number} indent spaces per level; 0 minifies
 * @returns {string | null} null when the text is not valid JSON
 */
export function reformatJSON(text, indent) {
	if (!isJSONText(text)) return null;
	const pad = (/** @type {number} */ depth) => (indent > 0 ? "\n" + " ".repeat(indent * depth) : "");
	let out = "";
	let depth = 0;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (/\s/.test(ch)) continue;
		if (ch === '"') {
			let j = i + 1;
			while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
			out += text.slice(i, j + 1);
			i = j;
		} else if (ch === "{" || ch === "[") {
			let k = i + 1;
			while (k < text.length && /\s/.test(text[k])) k++;
			if (text[k] === (ch === "{" ? "}" : "]")) {
				out += ch + text[k];
				i = k;
			} else {
				depth++;
				out += ch + pad(depth);
			}
		} else if (ch === "}" || ch === "]") {
			depth--;
			out += pad(depth) + ch;
		} else if (ch === ",") {
			out += "," + pad(depth);
		} else if (ch === ":") {
			out += indent > 0 ? ": " : ":";
		} else {
			let j = i;
			while (j < text.length && !/[\s,:\]}]/.test(text[j])) j++;
			out += text.slice(i, j);
			i = j - 1;
		}
	}
	return out;
}
