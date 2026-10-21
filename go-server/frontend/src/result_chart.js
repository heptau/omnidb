// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Chart of a query result: pick a chart type, the column for the x axis
/// (categories) and the numeric columns to plot, drawn with Chart.js from the
/// rows the result grid currently shows (so the grid's filter applies).
/// </summary>

import { buildChartData, numericColumns, paletteColor } from "./chart_data.js";
import { t } from "./i18n.js";
import { showAlert } from "./notification_control.js";

const CHART_TYPES = ["bar", "line", "pie", "doughnut"];

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

/** @type {any} */
let chart = null;

/**
 * Opens the chart dialog for a query tab's current result.
 * @param {any} p_tab_tag the query tab's tag (ht = result grid, result_columns / result_types)
 */
export function showResultChart(p_tab_tag) {
	const grid = p_tab_tag.ht;
	if (!grid || !p_tab_tag.result_columns || p_tab_tag.result_columns.length === 0) {
		showAlert(t("chart.no_result"));
		return;
	}
	/** @type {string[]} */
	const columns = p_tab_tag.result_columns;
	/** @type {Array<Array<unknown>>} */
	const rows = grid.getVisibleData();
	if (rows.length === 0) {
		showAlert(t("chart.no_rows"));
		return;
	}
	const numeric = numericColumns(p_tab_tag.result_types || null, rows, columns.length);
	const firstNumeric = numeric.indexOf(true);
	if (firstNumeric < 0) {
		showAlert(t("chart.no_numeric"));
		return;
	}

	showAlert('<div id="result_chart_root"></div>', null, true, true);
	const root = /** @type {HTMLElement} */ (document.getElementById("result_chart_root"));
	/** @type {HTMLElement} */ (document.getElementById("modal_message_content")).style.whiteSpace = "normal";

	const typeSelect = /** @type {HTMLSelectElement} */ (el("select", "form-select form-select-sm"));
	for (const type of CHART_TYPES) {
		const o = /** @type {HTMLOptionElement} */ (el("option", undefined, t("chart.type_" + type)));
		o.value = type;
		typeSelect.appendChild(o);
	}
	const xSelect = /** @type {HTMLSelectElement} */ (el("select", "form-select form-select-sm"));
	columns.forEach((name, i) => {
		const o = /** @type {HTMLOptionElement} */ (el("option", undefined, name));
		o.value = String(i);
		xSelect.appendChild(o);
	});
	// A text column makes the better category axis; otherwise the first column.
	const firstText = numeric.indexOf(false);
	xSelect.value = String(firstText >= 0 ? firstText : 0);

	const yBoxes = el("div", "d-flex flex-wrap gap-3");
	/** @type {HTMLInputElement[]} */
	const yInputs = [];
	columns.forEach((name, i) => {
		if (!numeric[i]) return;
		const wrap = el("div", "form-check");
		const input = /** @type {HTMLInputElement} */ (el("input", "form-check-input"));
		input.type = "checkbox";
		input.id = "chart_y_" + i;
		input.value = String(i);
		input.checked = i === (i === Number(xSelect.value) ? -1 : firstNumeric);
		const label = /** @type {HTMLLabelElement} */ (el("label", "form-check-label", name));
		label.htmlFor = input.id;
		wrap.append(input, label);
		yBoxes.appendChild(wrap);
		yInputs.push(input);
	});
	if (!yInputs.some((x) => x.checked) && yInputs.length) yInputs[0].checked = true;

	const note = el("div", "small text-muted mt-1");
	const holder = el("div", "mt-2");
	holder.style.cssText = "position:relative;height:50vh;";
	const canvas = /** @type {HTMLCanvasElement} */ (el("canvas"));
	holder.appendChild(canvas);

	const controls = el("div", "d-flex flex-wrap gap-3 align-items-end mb-2");
	const field = (/** @type {string} */ labelKey, /** @type {HTMLElement} */ control) => {
		const w = el("div");
		w.append(el("label", "form-label small mb-1", t(labelKey)), control);
		return w;
	};
	controls.append(field("chart.type", typeSelect), field("chart.x_axis", xSelect));
	root.append(controls, field("chart.y_axis", yBoxes), holder, note);

	const draw = () => {
		const type = typeSelect.value;
		const valueCols = yInputs.filter((x) => x.checked).map((x) => Number(x.value));
		if (chart) {
			chart.destroy();
			chart = null;
		}
		if (valueCols.length === 0) return;
		const data = buildChartData(rows, Number(xSelect.value), type === "pie" || type === "doughnut" ? valueCols.slice(0, 1) : valueCols, columns);
		note.textContent = data.truncated ? t("chart.truncated", { count: data.labels.length }) : "";
		const styles = getComputedStyle(document.body);
		const text = styles.getPropertyValue("--text-primary").trim() || "#444";
		const grid = styles.getPropertyValue("--border-color").trim() || "#ddd";
		const circular = type === "pie" || type === "doughnut";
		chart = new Chart(canvas, {
			type,
			data: {
				labels: data.labels,
				datasets: data.datasets.map((d, i) => ({
					label: d.label,
					data: d.data,
					backgroundColor: circular ? data.labels.map((_, k) => paletteColor(k)) : paletteColor(i),
					borderColor: type === "line" ? paletteColor(i) : circular ? undefined : paletteColor(i),
					borderWidth: type === "line" ? 2 : 1,
					pointRadius: type === "line" ? 2 : undefined,
					tension: 0,
				})),
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: false,
				color: text,
				plugins: { legend: { display: circular || data.datasets.length > 1, labels: { color: text } } },
				scales: circular
					? {}
					: {
							x: { ticks: { color: text, maxRotation: 60, autoSkip: true }, grid: { color: grid } },
							y: { ticks: { color: text }, grid: { color: grid } },
						},
			},
		});
	};
	for (const control of [typeSelect, xSelect, ...yInputs]) control.addEventListener("change", draw);
	draw();

	const modal = document.getElementById("modal_message");
	if (modal) {
		modal.addEventListener(
			"hidden.bs.modal",
			() => {
				if (chart) {
					chart.destroy();
					chart = null;
				}
			},
			{ once: true },
		);
	}
}
