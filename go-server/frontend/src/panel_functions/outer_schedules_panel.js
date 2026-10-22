// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// The Scheduled queries section, laid out like Snippets and Connections: a
/// list of the user's schedules on the left with an add/remove footer, and the
/// selected schedule's settings on the right -- name, interval, SQL -- which
/// can be changed and saved, run at once, paused or resumed, with its recent
/// runs underneath. "+" opens an empty form for a new schedule.
/// </summary>

import { execAjax } from "../ajax_control_bridge.js";
import { t } from "../i18n.js";
import { showAlert, showConfirm } from "../notification_control.js";

const CONTENT_ID = "omnidb__section_schedules";

/**
 * @typedef {{ id: number, conn_id: number, alias: string, name: string, sql: string, interval: number, enabled: boolean, next_run: number, last_started: number, last_status: string, last_message: string }} ScheduleRow
 * @typedef {{ id: number, started: number, duration_ms: number, status: string, message: string }} ScheduleRun
 */

/** The id of the selected schedule; `null` is the new-schedule form, `undefined` nothing. @type {number | null | undefined} */
let selected;

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
 * @param {string} label
 * @param {() => void} onClick
 * @param {boolean} [primary]
 * @returns {HTMLButtonElement}
 */
function button(label, onClick, primary) {
	const b = /** @type {HTMLButtonElement} */ (el("button", "btn btn-sm " + (primary ? "omnidb__theme__btn--primary" : "omnidb__theme__btn--secondary"), label));
	b.type = "button";
	b.addEventListener("click", onClick);
	return b;
}

/**
 * @param {string} key
 * @param {HTMLElement} control
 */
function field(key, control) {
	const w = el("div", "mb-3");
	w.append(el("label", "form-label small fw-bold mb-1", t(key)), control);
	return w;
}

/**
 * The last runs of a schedule, newest first.
 * @param {HTMLElement} box
 * @param {number} id
 */
function loadRuns(box, id) {
	call("/get_schedule_runs/", { p_id: id }, (/** @type {ScheduleRun[]} */ runs) => {
		box.innerHTML = "";
		if (runs.length === 0) {
			box.appendChild(el("div", "text-muted small", t("schedules.no_runs")));
			return;
		}
		const pre = el("pre", "p-2 small mb-0");
		pre.style.cssText = "max-height:30vh;overflow:auto;white-space:pre-wrap;border:1px solid var(--border-color);";
		pre.textContent = runs
			.map((r) => `${when(r.started)}  ${r.status === "ok" ? t("schedules.status_ok") : t("schedules.status_error")}  ${r.duration_ms} ms\n${r.message}`)
			.join("\n\n");
		box.appendChild(pre);
	});
}

/**
 * The right-hand pane: the settings of `schedule`, or an empty form for a new one.
 * @param {ScheduleRow | null} schedule
 * @param {() => void} refresh  redraws the whole section (keeping the selection)
 * @param {(id: number) => void} choose  selects a schedule by id (after creating one)
 * @returns {HTMLElement}
 */
function buildDetail(schedule, refresh, choose) {
	const pane = el("div", "omnidb__schedules__form");

	const head = el("div", "d-flex align-items-baseline gap-2 mb-3");
	head.appendChild(el("h5", "m-0", schedule ? schedule.name : t("schedules.new")));
	if (schedule && !schedule.enabled) head.appendChild(el("span", "badge text-bg-secondary", t("schedules.paused")));
	pane.appendChild(head);
	if (schedule) {
		pane.appendChild(
			el("div", "small text-muted mb-3", t("schedules.meta", { interval: schedule.interval, last: when(schedule.last_started), next: schedule.enabled ? when(schedule.next_run) : t("schedules.paused") })),
		);
	}

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
		// Where a schedule's SQL runs is fixed once it exists: moving it would
		// aim reviewed SQL at another database without anyone looking at it.
		target.disabled = true;
	} else {
		const current = v_connTabControl.selectedTab && v_connTabControl.selectedTab.tag && v_connTabControl.selectedTab.tag.selectedDatabaseIndex;
		if (current !== undefined && current !== null) target.value = String(current);
	}

	const interval = /** @type {HTMLInputElement} */ (el("input", "form-control form-control-sm"));
	interval.type = "number";
	interval.min = "1";
	interval.max = "10080";
	interval.value = schedule ? String(schedule.interval) : "60";
	interval.style.maxWidth = "160px";

	const sql = /** @type {HTMLTextAreaElement} */ (el("textarea", "form-control form-control-sm"));
	sql.rows = 10;
	sql.spellcheck = false;
	sql.style.fontFamily = "monospace";
	sql.value = schedule ? schedule.sql : "";

	pane.append(field("schedules.name", name), field("schedules.connection", target), field("schedules.interval", interval), field("schedules.sql", sql));

	const actions = el("div", "d-flex flex-wrap gap-2 mb-3");
	actions.appendChild(
		button(
			t("common.save"),
			() => {
				if (schedule) {
					call("/update_schedule/", { p_id: schedule.id, p_name: name.value, p_sql: sql.value, p_interval: Number(interval.value) }, refresh);
				} else {
					call("/add_schedule/", { p_conn_id: Number(target.value), p_name: name.value, p_sql: sql.value, p_interval: Number(interval.value) }, (/** @type {number} */ id) => choose(id));
				}
			},
			true,
		),
	);
	if (schedule) {
		const id = schedule.id;
		actions.append(
			button(t("schedules.run_now"), () => call("/run_schedule_now/", { p_id: id }, refresh)),
			button(schedule.enabled ? t("schedules.pause") : t("schedules.resume"), () => call("/set_schedule_enabled/", { p_id: id, p_enabled: !schedule.enabled }, refresh)),
		);
	}
	pane.appendChild(actions);

	if (schedule) {
		pane.appendChild(el("div", "fw-bold small mb-1", t("schedules.recent_runs")));
		const runs = el("div");
		pane.appendChild(runs);
		loadRuns(runs, schedule.id);
	}
	return pane;
}

/**
 * Re-reads the schedules and redraws the section. Called whenever the section is shown.
 */
export function refreshSchedulesPane() {
	const root = document.getElementById(CONTENT_ID);
	if (!root) return;
	call("/get_schedules/", {}, (/** @type {ScheduleRow[]} */ rows) => {
		if (typeof selected === "number" && !rows.some((r) => r.id === selected)) selected = undefined;
		const redraw = () => refreshSchedulesPane();
		/** @param {number | null | undefined} id */
		const select = (id) => {
			selected = id;
			redraw();
		};

		root.innerHTML = "";
		const body = el("div", "omnidb__section__body");
		const layout = el("div", "omnidb__schedules");

		// Left: the list and its add/remove footer.
		const sidebar = el("div", "omnidb__schedules__sidebar");
		const list = el("div", "omnidb__schedules__list");
		if (rows.length === 0 && selected !== null) list.appendChild(el("div", "text-muted small p-2", t("schedules.none")));
		for (const s of rows) {
			const item = el("div", "omnidb__settings__list-item" + (s.id === selected ? " omnidb__settings__list-item--selected" : ""));
			const icon = el("i", "fas omnidb__settings__list-item-icon " + (s.enabled ? "fa-calendar-alt" : "fa-pause-circle"));
			if (s.last_status === "error" && s.id !== selected) icon.style.color = "var(--bs-danger, #dc3545)";
			const text = el("div", "flex-grow-1");
			text.style.minWidth = "0";
			const title = el("div", "omnidb__settings__list-item-title", s.name);
			title.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
			const sub = el("div", "small", `${s.alias} · ${t("schedules.every", { interval: s.interval })}`);
			sub.style.cssText = "opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
			text.append(title, sub);
			item.append(icon, text);
			item.addEventListener("click", () => select(s.id));
			list.appendChild(item);
		}
		const footer = el("div", "omnidb__list-footer");
		const group = el("div", "omnidb__addremove");
		const add = /** @type {HTMLButtonElement} */ (el("button"));
		add.type = "button";
		add.title = t("schedules.new");
		add.setAttribute("aria-label", t("schedules.new"));
		add.appendChild(el("i", "fas fa-plus"));
		add.addEventListener("click", () => select(null));
		const divider = el("span", "omnidb__addremove-divider");
		const remove = /** @type {HTMLButtonElement} */ (el("button"));
		remove.type = "button";
		remove.title = t("common.delete");
		remove.setAttribute("aria-label", t("common.delete"));
		remove.appendChild(el("i", "fas fa-minus"));
		const current = rows.find((r) => r.id === selected);
		remove.disabled = !current;
		remove.addEventListener("click", () => {
			if (!current) return;
			showConfirm(t("schedules.confirm_delete", { name: current.name }), () =>
				call("/delete_schedule/", { p_id: current.id }, () => {
					selected = undefined;
					redraw();
				}),
			);
		});
		group.append(add, divider, remove);
		footer.appendChild(group);
		sidebar.append(list, footer);

		// Right: the selected schedule's settings.
		const detail = el("div", "omnidb__schedules__detail");
		if (current) detail.appendChild(buildDetail(current, redraw, select));
		else if (selected === null) detail.appendChild(buildDetail(null, redraw, select));
		else {
			detail.appendChild(el("h5", "mb-2", t("nav.schedules")));
			detail.appendChild(el("p", "text-muted small", t("schedules.hint")));
			detail.appendChild(el("p", "text-muted", t("schedules.select_hint")));
		}

		layout.append(sidebar, detail);
		body.appendChild(layout);
		root.appendChild(body);
	});
}
