// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// The Scheduled queries section: every schedule of the user with its latest
/// outcome, and a form to create or edit one. Each schedule can be run now,
/// paused or resumed, inspected (its last runs) and deleted. The query tab's
/// calendar button adds a schedule from the editor's text; this is where they
/// are managed.
/// </summary>

import { execAjax } from "../ajax_control_bridge.js";
import { t } from "../i18n.js";
import { showAlert, showConfirm } from "../notification_control.js";

const CONTENT_ID = "omnidb__section_schedules";

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
 * @param {string} url
 * @param {object} body
 * @param {(data: any) => void} done
 */
function call(url, body, done) {
	execAjax(
		url,
		JSON.stringify(body),
		(/** @type {{ v_data: any }} */ r) => done(r.v_data),
		(/** @type {{ v_data: any }} */ r) => showAlert(typeof r.v_data === "string" ? r.v_data : (r.v_data && r.v_data.message) || t("errors.request_error")),
		"box",
		false,
	);
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
	pre.style.cssText = "max-height:24vh;overflow:auto;white-space:pre-wrap;border:1px solid var(--border-color);";
	pre.textContent = runs
		.map((r) => `${when(r.started)}  ${r.status === "ok" ? t("schedules.status_ok") : t("schedules.status_error")}  ${r.duration_ms} ms\n${r.message}`)
		.join("\n\n");
	box.appendChild(pre);
}

/**
 * The create/edit form. `schedule` null creates a new schedule.
 * @param {ScheduleRow | null} schedule
 * @param {() => void} done  called after a save, to redraw the section
 * @returns {HTMLElement}
 */
function buildForm(schedule, done) {
	const form = el("div", "p-3 mb-3");
	form.style.cssText = "border:1px solid var(--border-color);border-radius:4px;";
	form.appendChild(el("div", "fw-bold mb-2", schedule ? t("schedules.edit_title") : t("schedules.new")));

	const name = /** @type {HTMLInputElement} */ (el("input", "form-control form-control-sm"));
	name.type = "text";
	name.placeholder = t("schedules.name_placeholder");
	name.value = schedule ? schedule.name : "";

	const target = /** @type {HTMLSelectElement} */ (el("select", "form-select form-select-sm"));
	/** @type {Array<{ v_conn_id: number, v_alias: string, v_details1: string }>} */
	const connections = (v_connTabControl.tag.connections || []).filter((/** @type {any} */ c) => c.v_db_type !== "terminal");
	for (const c of connections) {
		const o = /** @type {HTMLOptionElement} */ (el("option", undefined, c.v_alias || c.v_details1 || String(c.v_conn_id)));
		o.value = String(c.v_conn_id);
		target.appendChild(o);
	}
	if (schedule) {
		target.value = String(schedule.conn_id);
		// The connection of an existing schedule is fixed: moving it would
		// change where its SQL runs without any review of that SQL.
		target.disabled = true;
	}

	const interval = /** @type {HTMLInputElement} */ (el("input", "form-control form-control-sm"));
	interval.type = "number";
	interval.min = "1";
	interval.max = "10080";
	interval.value = schedule ? String(schedule.interval) : "60";

	const sql = /** @type {HTMLTextAreaElement} */ (el("textarea", "form-control form-control-sm"));
	sql.rows = 6;
	sql.spellcheck = false;
	sql.style.fontFamily = "monospace";
	sql.value = schedule ? schedule.sql : "";

	/**
	 * @param {string} key
	 * @param {HTMLElement} control
	 */
	const field = (key, control) => {
		const w = el("div", "mb-2");
		w.append(el("label", "form-label small fw-bold mb-1", t(key)), control);
		return w;
	};
	form.append(field("schedules.name", name), field("schedules.connection", target), field("schedules.interval", interval), field("schedules.sql", sql));

	const buttons = el("div", "d-flex gap-2");
	const save = /** @type {HTMLButtonElement} */ (el("button", "btn btn-sm omnidb__theme__btn--primary", t("common.save")));
	save.type = "button";
	save.addEventListener("click", () => {
		if (schedule) {
			call("/update_schedule/", { p_id: schedule.id, p_name: name.value, p_sql: sql.value, p_interval: Number(interval.value) }, done);
		} else {
			call("/add_schedule/", { p_conn_id: Number(target.value), p_name: name.value, p_sql: sql.value, p_interval: Number(interval.value) }, done);
		}
	});
	const cancel = /** @type {HTMLButtonElement} */ (el("button", "btn btn-sm omnidb__theme__btn--secondary", t("common.cancel")));
	cancel.type = "button";
	cancel.addEventListener("click", done);
	buttons.append(save, cancel);
	form.appendChild(buttons);
	return form;
}

/**
 * @param {ScheduleRow} s
 * @param {() => void} refresh
 * @param {(s: ScheduleRow) => void} edit
 * @returns {HTMLElement}
 */
function buildCard(s, refresh, edit) {
	const card = el("div", "mb-3 p-3");
	card.style.cssText = "border:1px solid var(--border-color);border-radius:4px;";
	const head = el("div", "d-flex align-items-baseline gap-2");
	head.append(el("span", "fw-bold", s.name), el("span", "text-muted small", s.alias));
	if (!s.enabled) head.appendChild(el("span", "badge text-bg-secondary", t("schedules.paused")));
	const meta = el("div", "small text-muted", t("schedules.meta", { interval: s.interval, last: when(s.last_started), next: s.enabled ? when(s.next_run) : t("schedules.paused") }));
	const status = el("div", "small", s.last_status ? (s.last_status === "ok" ? t("schedules.status_ok") : t("schedules.status_error")) + ": " + s.last_message.split("\n").slice(-1)[0] : "");
	if (s.last_status === "error") status.style.color = "var(--bs-danger, #dc3545)";
	const sql = el("pre", "p-2 small my-2", s.sql);
	sql.style.cssText = "max-height:12vh;overflow:auto;white-space:pre-wrap;border:1px solid var(--border-color);";
	const runs = el("div", "mt-2");
	const buttons = el("div", "d-flex flex-wrap gap-2");
	/**
	 * @param {string} label
	 * @param {() => void} onClick
	 */
	const button = (label, onClick) => {
		const b = /** @type {HTMLButtonElement} */ (el("button", "btn btn-sm omnidb__theme__btn--secondary", label));
		b.type = "button";
		b.addEventListener("click", onClick);
		buttons.appendChild(b);
	};
	button(t("schedules.run_now"), () => call("/run_schedule_now/", { p_id: s.id }, refresh));
	button(s.enabled ? t("schedules.pause") : t("schedules.resume"), () => call("/set_schedule_enabled/", { p_id: s.id, p_enabled: !s.enabled }, refresh));
	button(t("schedules.history"), () => call("/get_schedule_runs/", { p_id: s.id }, (/** @type {ScheduleRun[]} */ data) => renderRuns(runs, data)));
	button(t("common.edit"), () => edit(s));
	button(t("schedules.delete"), () => showConfirm(t("schedules.confirm_delete", { name: s.name }), () => call("/delete_schedule/", { p_id: s.id }, refresh)));
	card.append(head, meta, status, sql, buttons, runs);
	return card;
}

/**
 * Re-reads the schedules and redraws the section. Called whenever the section is shown.
 * @param {ScheduleRow | null | undefined} [editing]  a schedule to edit; `null` opens the new-schedule form
 */
export function refreshSchedulesPane(editing) {
	const root = document.getElementById(CONTENT_ID);
	if (!root) return;
	call("/get_schedules/", {}, (/** @type {ScheduleRow[]} */ rows) => {
		const redraw = () => refreshSchedulesPane();
		root.innerHTML = "";
		const wrap = el("div", "omnidb__schedules p-3");
		wrap.style.maxWidth = "900px";
		const title = el("div", "d-flex align-items-center justify-content-between mb-3");
		title.appendChild(el("h5", "m-0", t("nav.schedules")));
		const add = /** @type {HTMLButtonElement} */ (el("button", "btn btn-sm omnidb__theme__btn--primary", t("schedules.new")));
		add.type = "button";
		add.addEventListener("click", () => refreshSchedulesPane(null));
		title.appendChild(add);
		wrap.appendChild(title);
		wrap.appendChild(el("p", "text-muted small", t("schedules.hint")));

		if (editing !== undefined) wrap.appendChild(buildForm(editing, redraw));
		if (rows.length === 0 && editing === undefined) wrap.appendChild(el("p", "text-muted", t("schedules.none")));
		for (const s of rows) {
			if (editing && editing.id === s.id) continue;
			wrap.appendChild(buildCard(s, redraw, (row) => refreshSchedulesPane(row)));
		}
		root.appendChild(wrap);
	});
}
