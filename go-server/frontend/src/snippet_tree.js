// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Helpers over the nested snippet tree get_all_snippets returns.
/// </summary>

/**
 * Snippet files of the (nested) snippet tree get_all_snippets returns.
 * @param {any} tree
 * @param {string} path
 * @returns {Array<{ id: number, name: string, path: string }>}
 */
export function flattenSnippets(tree, path = "") {
	if (!tree) return [];
	/** @type {Array<{ id: number, name: string, path: string }>} */
	const out = (tree.files || []).map((/** @type {any} */ f) => ({ id: f.id, name: f.name, path }));
	for (const folder of tree.folders || []) {
		out.push(...flattenSnippets(folder, path ? path + " / " + folder.name : folder.name));
	}
	return out;
}
