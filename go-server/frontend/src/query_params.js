// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Named query parameters (`:name`): finding them in a statement, asking for
/// their values and substituting them before the statement is sent.
/// </summary>

import { t } from "./i18n.js";
import { setMessageModalTitle, showConfirm } from "./notification_control.js";

/** @typedef {"auto" | "text" | "sql"} ParamMode */
/** @typedef {{ value: string, mode: ParamMode }} ParamValue */

/**
 * Finds every `:name` placeholder outside string literals, quoted
 * identifiers, comments and PostgreSQL dollar-quoted bodies. `::cast`, a colon
 * glued to a preceding identifier or bracket (`arr[a:b]`, `x::int`) and
 * `:=` never count.
 *
 * @param {string} sql
 * @returns {Array<{ name: string, start: number, end: number }>}
 */
export function findParamOccurrences(sql) {
	/** @type {Array<{ name: string, start: number, end: number }>} */
	const found = [];
	let state = "normal";
	let dollarTag = "";
	for (let i = 0; i < sql.length; i++) {
		const ch = sql[i];
		const next = sql[i + 1];
		if (state === "normal") {
			if (ch === "'") state = "single";
			else if (ch === '"') state = "double";
			else if (ch === "`") state = "backtick";
			else if (ch === "-" && next === "-") state = "line_comment";
			else if (ch === "/" && next === "*") {
				state = "block_comment";
				i++;
			} else if (ch === "$") {
				const m = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i));
				if (m && !/[\w$]/.test(sql[i - 1] || "")) {
					state = "dollar";
					dollarTag = m[0];
					i += m[0].length - 1;
				}
			} else if (ch === ":" && next !== ":" && /[A-Za-z_]/.test(next || "") && !/[\w\])":]/.test(sql[i - 1] || "")) {
				const m = /^[A-Za-z_]\w*/.exec(sql.slice(i + 1));
				if (m) {
					found.push({ name: m[0], start: i, end: i + 1 + m[0].length });
					i += m[0].length;
				}
			}
		} else if (state === "single") {
			if (ch === "'") state = "normal";
		} else if (state === "double") {
			if (ch === '"') state = "normal";
		} else if (state === "backtick") {
			if (ch === "`") state = "normal";
		} else if (state === "line_comment") {
			if (ch === "\n") state = "normal";
		} else if (state === "block_comment") {
			if (ch === "*" && next === "/") {
				state = "normal";
				i++;
			}
		} else if (state === "dollar") {
			if (sql.startsWith(dollarTag, i)) {
				state = "normal";
				i += dollarTag.length - 1;
			}
		}
	}
	return found;
}

/**
 * @param {string} sql
 * @returns {string[]} distinct parameter names in order of first appearance
 */
export function findQueryParams(sql) {
	return [...new Set(findParamOccurrences(sql).map((o) => o.name))];
}

/**
 * @param {ParamValue} param
 * @param {string} technology
 * @returns {string} the SQL text to put in place of the placeholder
 */
export function paramLiteral(param, technology) {
	const value = param.value;
	if (param.mode === "sql") return value;
	if (param.mode === "auto") {
		if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(value.trim())) return value.trim();
		if (/^(null|true|false)$/i.test(value.trim())) return value.trim().toUpperCase();
	}
	let text = value;
	// MySQL/MariaDB treat a backslash inside a string as an escape character.
	if (technology === "mysql" || technology === "mariadb") text = text.replace(/\\/g, "\\\\");
	return "'" + text.replace(/'/g, "''") + "'";
}

/**
 * @param {string} sql
 * @param {Record<string, ParamValue>} values
 * @param {string} technology
 * @returns {string}
 */
export function applyQueryParams(sql, values, technology) {
	let out = "";
	let last = 0;
	for (const occ of findParamOccurrences(sql)) {
		const param = values[occ.name];
		if (!param) continue;
		out += sql.slice(last, occ.start) + paramLiteral(param, technology);
		last = occ.end;
	}
	return out + sql.slice(last);
}

/** Values entered earlier in this page's lifetime, offered again next time. */
/** @type {Record<string, ParamValue>} */
const rememberedValues = {};

/**
 * Asks for a value per parameter, then calls onValues with them.
 *
 * @param {string[]} names
 * @param {(values: Record<string, ParamValue>) => void} onValues
 */
export function promptQueryParams(names, onValues) {
	/** @type {Record<string, { input: HTMLInputElement, mode: HTMLSelectElement }>} */
	const fields = {};

	const confirm = () => {
		/** @type {Record<string, ParamValue>} */
		const values = {};
		for (const name of names) {
			const f = fields[name];
			if (!f) continue;
			values[name] = { value: f.input.value, mode: /** @type {ParamMode} */ (f.mode.value) };
			rememberedValues[name] = values[name];
		}
		onValues(values);
	};

	showConfirm(
		"",
		confirm,
		null,
		function () {
			setMessageModalTitle(t("query.params_title"), "fas node-all fa-list-alt");
			const content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));
			content.style.whiteSpace = "normal";
			content.innerHTML = "";
			names.forEach((name, i) => {
				const remembered = rememberedValues[name];
				const row = document.createElement("div");
				row.className = "mb-2";

				const label = document.createElement("label");
				label.className = "form-label mb-1";
				label.textContent = ":" + name;

				const group = document.createElement("div");
				group.className = "input-group";

				const input = document.createElement("input");
				input.type = "text";
				input.className = "form-control";
				input.value = remembered ? remembered.value : "";
				input.setAttribute("aria-label", ":" + name);
				input.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						document.getElementById("modal_message_ok")?.click();
					}
				});

				const mode = document.createElement("select");
				mode.className = "form-select";
				mode.style.maxWidth = "7.5rem";
				for (const [value, key] of /** @type {Array<[ParamMode, string]>} */ ([
					["auto", "query.params_mode_auto"],
					["text", "query.params_mode_text"],
					["sql", "query.params_mode_sql"],
				])) {
					const option = document.createElement("option");
					option.value = value;
					option.textContent = t(key);
					mode.appendChild(option);
				}
				mode.value = remembered ? remembered.mode : "auto";

				group.append(input, mode);
				row.append(label, group);
				content.appendChild(row);
				fields[name] = { input, mode };
				if (i === 0) input.focus();
			});
		},
		"form",
		t("query.params_run"),
	);
}
