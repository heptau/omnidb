// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Scheduled queries: SQL the server runs on a connection every N minutes
/// while OmniDB is open, with the outcome of the latest runs. The dialog lists
/// the user's schedules (run now, pause, history, delete) and adds one from the
/// editor's current text.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";
import { t } from "./i18n.js";
import { setMessageModalTitle, showAlert, showConfirm } from "./notification_control.js";

/**
 * @typedef {{ id: number, conn_id: number, alias: string, name: string, sql: string, interval: number, enabled: boolean, next_run: number, last_started: number, last_status: string, last_message: string }} ScheduleRow
 * @typedef {{ id: number, started: number, duration_ms: number, status: string, message: string }} ScheduleRun
 */

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
	const e = document.createElement(tag);
	if (className) e.className = className;
	if (text !== undefined) e.textContent = text;
	return e;
}

/** @param {number} unixSeconds */
function when(unixSeconds) {
	return unixSeconds ? new Date(unixSeconds * 1000).toLocaleString() : "—";
}

/**
 * @param {{ v_data: any }} r
 * @returns {string}
 */
function errorText(r) {
	const v = r.v_data;
	return typeof v === "string" ? v : (v && v.message) || t("errors.request_error");
}

/**
 * @param {string} url
 * @param {object} body
 * @param {(data: any) => void} done
 */
function call(url, body, done) {
	execAjax(url, JSON.stringify(body), (/** @type {{ v_data: any }} */ r) => done(r.v_data), (/** @type {{ v_data: any }} */ r) => showAlert(errorText(r)), "box", false);
}

/**
 * @param {HTMLElement} box
 * @param {ScheduleRun[]} runs
 */
function renderRuns(box, runs) {
	box.innerHTML = "";
	if (runs.length === 0) {
		box.appendChild(el("div", "text-muted small", t("schedules.no_runs")));
		return;
	}
	const pre = el("pre", "p-2 small mb-0");
	pre.style.cssText = "max-height:20vh;overflow:auto;white-space:pre-wrap;border:1px solid var(--border-color);";
	pre.textContent = runs
		.map((r) => `${when(r.started)}  ${r.status === "ok" ? t("schedules.status_ok") : t("schedules.status_error")}  ${r.duration_ms} ms\n${r.message}`)
		.join("\n\n");
	box.appendChild(pre);
}

/**
 * @param {HTMLElement} list
 * @param {ScheduleRow[]} rows
 * @param {() => void} refresh
 */
function renderList(list, rows, refresh) {
	list.innerHTML = "";
	if (rows.length === 0) {
		list.appendChild(el("div", "text-muted small mb-2", t("schedules.none")));
		return;
	}
	for (const s of rows) {
		const item = el("div", "mb-2 p-2");
		item.style.cssText = "border:1px solid var(--border-color);border-radius:4px;";
		const title = el("div", "fw-bold", `${s.name} — ${s.alias}`);
		const meta = el(
			"div",
			"small text-muted",
			t("schedules.meta", { interval: s.interval, last: when(s.last_started), next: s.enabled ? when(s.next_run) : t("schedules.paused") }),
		);
		const status = el("div", "small", s.last_status ? (s.last_status === "ok" ? t("schedules.status_ok") : t("schedules.status_error")) + ": " + s.last_message.split("\n").slice(-1)[0] : "");
		if (s.last_status === "error") status.style.color = "var(--bs-danger, #dc3545)";
		const runs = el("div", "mt-1");
		const buttons = el("div", "mt-1");
		/**
		 * @param {string} label
		 * @param {() => void} onClick
		 */
		const button = (label, onClick) => {
			const b = /** @type {HTMLButtonElement} */ (el("button", "btn btn-sm omnidb__theme__btn--secondary me-1", label));
			b.type = "button";
			b.addEventListener("click", onClick);
			buttons.appendChild(b);
		};
		button(t("schedules.run_now"), () => call("/run_schedule_now/", { p_id: s.id }, refresh));
		button(s.enabled ? t("schedules.pause") : t("schedules.resume"), () => call("/set_schedule_enabled/", { p_id: s.id, p_enabled: !s.enabled }, refresh));
		button(t("schedules.history"), () => call("/get_schedule_runs/", { p_id: s.id }, (/** @type {ScheduleRun[]} */ data) => renderRuns(runs, data)));
		button(t("schedules.delete"), () => call("/delete_schedule/", { p_id: s.id }, refresh));
		item.append(title, meta, status, buttons, runs);
		list.appendChild(item);
	}
}

/**
 * @param {() => string} getSql  text to schedule (the selection, else the whole editor)
 * @param {() => number} getConnId  connection of the current tab
 */
export function openSchedulesDialog(getSql, getConnId) {
	/** @type {Array<{ v_conn_id: number, v_alias: string, v_details1: string }>} */
	const connections = (v_connTabControl.tag.connections || []).filter((/** @type {any} */ c) => c.v_db_type !== "terminal");

	const list = el("div", "mb-3");
	const name = /** @type {HTMLInputElement} */ (el("input", "form-control form-control-sm"));
	name.type = "text";
	name.placeholder = t("schedules.name_placeholder");
	const target = /** @type {HTMLSelectElement} */ (el("select", "form-select form-select-sm"));
	for (const c of connections) {
		const o = /** @type {HTMLOptionElement} */ (el("option", undefined, c.v_alias || c.v_details1 || String(c.v_conn_id)));
		o.value = String(c.v_conn_id);
		target.appendChild(o);
	}
	target.value = String(getConnId());
	const interval = /** @type {HTMLInputElement} */ (el("input", "form-control form-control-sm"));
	interval.type = "number";
	interval.min = "1";
	interval.max = "10080";
	interval.value = "60";
	const sql = /** @type {HTMLTextAreaElement} */ (el("textarea", "form-control form-control-sm"));
	sql.rows = 5;
	sql.spellcheck = false;
	sql.value = getSql();
	sql.style.fontFamily = "monospace";

	const refresh = () => call("/get_schedules/", {}, (/** @type {ScheduleRow[]} */ rows) => renderList(list, rows, refresh));

	/**
	 * @param {string} key
	 * @param {HTMLElement} control
	 */
	const field = (key, control) => {
		const w = el("div", "mb-2");
		w.append(el("label", "form-label small mb-1", t(key)), control);
		return w;
	};

	showConfirm(
		"",
		function () {
			call("/add_schedule/", { p_conn_id: Number(target.value), p_name: name.value, p_sql: sql.value, p_interval: Number(interval.value) }, () =>
				openSchedulesDialog(getSql, getConnId),
			);
		},
		null,
		function () {
			setMessageModalTitle(t("schedules.title"));
			const content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));
			content.style.whiteSpace = "normal";
			content.innerHTML = "";
			content.append(
				list,
				el("div", "fw-bold mb-1", t("schedules.new")),
				field("schedules.name", name),
				field("schedules.connection", target),
				field("schedules.interval", interval),
				field("schedules.sql", sql),
				el("div", "small text-muted", t("schedules.hint")),
			);
			refresh();
		},
		true,
		t("schedules.add"),
	);
}
