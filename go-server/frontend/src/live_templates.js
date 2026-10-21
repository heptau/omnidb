// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Live templates: type an abbreviation in a SQL editor and press Tab to expand
/// it into a statement skeleton whose placeholders you tab through. A built-in
/// set ships with the app; your own live in the Snippets section, as snippets
/// inside a folder named "Live templates" -- the snippet's name is the
/// abbreviation, its text the template.
///
/// Template syntax is Ace's own snippet syntax: `${1:default}` is a tab stop
/// (the same number again is a mirror), `$0` is where the cursor ends up.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";
import { flattenSnippets } from "./snippet_tree.js";

/** The snippet folder user templates are read from. */
export const TEMPLATE_FOLDER = "Live templates";

/** @type {Record<string, string>} */
export const BUILT_IN_TEMPLATES = {
	sel: "SELECT ${1:*}\nFROM ${2:table}\nWHERE ${3:condition}$0",
	cnt: "SELECT count(*)\nFROM ${1:table}$0",
	grp: "SELECT ${1:column}, count(*)\nFROM ${2:table}\nGROUP BY ${1:column}\nORDER BY 2 DESC$0",
	ins: "INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values});$0",
	upd: "UPDATE ${1:table}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition};$0",
	del: "DELETE FROM ${1:table}\nWHERE ${2:condition};$0",
	jn: "${1:INNER} JOIN ${2:table} ${3:t} ON ${3:t}.${4:id} = ${5:other}.${6:id}$0",
	cte: "WITH ${1:name} AS (\n\t${2:SELECT 1}\n)\nSELECT *\nFROM ${1:name}$0",
	crt: "CREATE TABLE ${1:name} (\n\t${2:id} ${3:integer} PRIMARY KEY,\n\t$0\n);",
};

/** @type {Record<string, string>} */
let userTemplates = {};

/**
 * The template an abbreviation stands for; the user's own win over built-in ones.
 * @param {string} word
 * @returns {string | null}
 */
export function templateFor(word) {
	const key = word.toLowerCase();
	if (Object.prototype.hasOwnProperty.call(userTemplates, key)) return userTemplates[key];
	if (Object.prototype.hasOwnProperty.call(BUILT_IN_TEMPLATES, key)) return BUILT_IN_TEMPLATES[key];
	return null;
}

/**
 * Snippets of the template folder (at any depth) whose name can serve as an
 * abbreviation.
 * @param {any} tree the snippet tree get_all_snippets returns
 * @returns {Array<{ id: number, trigger: string }>}
 */
export function templateSnippets(tree) {
	return flattenSnippets(tree)
		.filter((s) => s.path === TEMPLATE_FOLDER || s.path.startsWith(TEMPLATE_FOLDER + " / "))
		.filter((s) => /^[\w$]+$/.test(s.name.trim()))
		.map((s) => ({ id: s.id, trigger: s.name.trim().toLowerCase() }));
}

/**
 * Re-reads the user's templates from the snippet tree; called whenever the
 * snippets are (re)loaded.
 * @param {any} tree
 */
export function refreshUserTemplates(tree) {
	const wanted = templateSnippets(tree);
	/** @type {Record<string, string>} */
	const next = {};
	let pending = wanted.length;
	if (pending === 0) {
		userTemplates = {};
		return;
	}
	const done = () => {
		if (--pending === 0) userTemplates = next;
	};
	for (const snippet of wanted) {
		execAjax(
			"/get_snippet_text/",
			JSON.stringify({ p_st_id: snippet.id }),
			function (/** @type {{ v_data: string }} */ r) {
				next[snippet.trigger] = r.v_data;
				done();
			},
			done,
			"box",
			false,
		);
	}
}

/**
 * Expands the abbreviation just before the cursor, if it is one.
 * @param {any} editor an Ace editor
 * @returns {boolean} whether a template was inserted
 */
export function expandLiveTemplate(editor) {
	if (editor.getReadOnly() || !editor.selection.isEmpty()) return false;
	const pos = editor.getCursorPosition();
	const match = /[\w$]+$/.exec(editor.session.getLine(pos.row).slice(0, pos.column));
	if (!match) return false;
	const content = templateFor(match[0]);
	if (content === null) return false;
	const Range = ace.require("ace/range").Range;
	editor.session.remove(new Range(pos.row, pos.column - match[0].length, pos.row, pos.column));
	ace.require("ace/snippets").snippetManager.insertSnippet(editor, content);
	return true;
}
