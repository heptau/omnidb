// @ts-check
/**
 * Time-range dropdown shared by the Console History and Command History
 * filters: a list of presets ("Last 6 Hours", "Yesterday", ...) plus a custom
 * range -- a calendar for the days and two native time inputs for the hours.
 *
 * Replaces the daterangepicker jQuery plugin (and with it jQuery and moment).
 * The calendar is vanilla-calendar-pro, which only handles a single time of
 * day, not one per end of a range, hence the separate time inputs.
 *
 * The result is written to the two (hidden) text inputs the callers already
 * read: an ISO timestamp for the start, and for the end either an ISO
 * timestamp or "" meaning "up to now" -- the same contract the plugin had.
 */

import { Calendar } from "vanilla-calendar-pro";
import { t } from "./i18n.js";

/**
 * @typedef {{key: string, from: () => Date, to: (() => Date) | null}} Preset
 * `to === null` is an open-ended range (up to the moment the query runs).
 */

/** @type {Preset[]} */
const PRESETS = [
	{ key: "last_6_hours", from: () => hoursAgo(6), to: null },
	{ key: "last_12_hours", from: () => hoursAgo(12), to: null },
	{ key: "last_24_hours", from: () => hoursAgo(24), to: null },
	{ key: "last_7_days", from: () => startOfDay(daysAgo(7)), to: null },
	{ key: "last_30_days", from: () => startOfDay(daysAgo(30)), to: null },
	{ key: "yesterday", from: () => startOfDay(daysAgo(1)), to: () => endOfDay(daysAgo(1)) },
	{ key: "this_month", from: () => new Date(new Date().getFullYear(), new Date().getMonth(), 1), to: null },
	{
		key: "last_month",
		from: () => new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
		to: () => new Date(new Date().getFullYear(), new Date().getMonth(), 0, 23, 59, 59, 999),
	},
];

/** @param {number} n */
function hoursAgo(n) {
	return new Date(Date.now() - n * 3600 * 1000);
}

/** @param {number} n */
function daysAgo(n) {
	var d = new Date();
	d.setDate(d.getDate() - n);
	return d;
}

/** @param {Date} d */
function startOfDay(d) {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** @param {Date} d */
function endOfDay(d) {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** @param {number} n */
function pad(n) {
	return String(n).padStart(2, "0");
}

/**
 * Local calendar day as the YYYY-MM-DD string vanilla-calendar-pro uses.
 * @param {Date} d
 */
function toDayString(d) {
	return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

/** @param {Date} d */
function toTimeString(d) {
	return pad(d.getHours()) + ":" + pad(d.getMinutes());
}

/**
 * @param {string} day YYYY-MM-DD
 * @param {string} time HH:MM
 * @param {number} [seconds]
 */
function fromDayAndTime(day, time, seconds = 0) {
	var [y, m, d] = day.split("-").map(Number);
	var [hh, mm] = (time || "00:00").split(":").map(Number);
	return new Date(y, m - 1, d, hh, mm, seconds, seconds ? 999 : 0);
}

/**
 * Parses the ISO value a caller keeps in its hidden input; falls back to
 * `fallback` when it is empty ("up to now") or unparsable.
 * @param {string} value
 * @param {Date} fallback
 */
function parseInputDate(value, fallback) {
	var d = value ? new Date(value) : fallback;
	return isNaN(d.getTime()) ? fallback : d;
}

/**
 * @param {HTMLElement} label
 * @param {Date} from
 * @param {Date} to
 */
function setCustomLabel(label, from, to) {
	var fmt = new Intl.DateTimeFormat(window.v_language || "en", { dateStyle: "medium", timeStyle: "short" });
	label.textContent = fmt.format(from) + " - " + fmt.format(to);
}

/**
 * @param {{
 *   button: HTMLElement,
 *   label: HTMLElement,
 *   container: HTMLElement,
 *   fromInput: HTMLInputElement,
 *   toInput: HTMLInputElement,
 *   onChange: () => void,
 * }} o
 * `container` must be `position: relative` and wrap the button; the dropdown opens right below it.
 */
export function setupTimeRangePicker({ button, label, container, fromInput, toInput, onChange }) {
	label.textContent = t("timerange.last_6_hours");

	/** @type {HTMLElement | null} */
	var panel = null;
	/** @type {Calendar | null} */
	var calendar = null;

	function close() {
		if (calendar) {
			calendar.destroy();
			calendar = null;
		}
		if (panel) {
			panel.remove();
			panel = null;
		}
		document.removeEventListener("mousedown", onOutsideMouseDown, true);
		document.removeEventListener("keydown", onKeyDown, true);
	}

	/** @param {MouseEvent} e */
	function onOutsideMouseDown(e) {
		var target = /** @type {Node} */ (e.target);
		if (panel && !panel.contains(target) && !button.contains(target)) close();
	}

	/** @param {KeyboardEvent} e */
	function onKeyDown(e) {
		if (e.key === "Escape") close();
	}

	/**
	 * @param {Date} from
	 * @param {Date | null} to
	 * @param {() => void} setLabel
	 */
	function apply(from, to, setLabel) {
		fromInput.value = from.toISOString();
		toInput.value = to ? to.toISOString() : "";
		setLabel();
		close();
		onChange();
	}

	function open() {
		if (panel) {
			close();
			return;
		}

		panel = document.createElement("div");
		panel.className = "omnidb-trp";

		var ranges = document.createElement("ul");
		ranges.className = "omnidb-trp__ranges";
		for (const preset of PRESETS) {
			var li = document.createElement("li");
			li.textContent = t("timerange." + preset.key);
			li.addEventListener("click", () =>
				apply(preset.from(), preset.to ? preset.to() : null, () => {
					label.textContent = t("timerange." + preset.key);
				}),
			);
			ranges.appendChild(li);
		}
		var customItem = document.createElement("li");
		customItem.textContent = t("timerange.custom_range");
		ranges.appendChild(customItem);
		panel.appendChild(ranges);

		var custom = document.createElement("div");
		custom.className = "omnidb-trp__custom";
		custom.hidden = true;

		var calendarEl = document.createElement("div");
		custom.appendChild(calendarEl);

		var times = document.createElement("div");
		times.className = "omnidb-trp__times";
		/** @param {string} text */
		var makeTimeInput = (text) => {
			var wrap = document.createElement("label");
			wrap.append(text + " ");
			var input = document.createElement("input");
			input.type = "time";
			input.className = "form-control form-control-sm";
			wrap.appendChild(input);
			times.appendChild(wrap);
			return input;
		};
		var fromTime = makeTimeInput(t("common.start_time"));
		var toTime = makeTimeInput(t("common.end_time"));
		custom.appendChild(times);

		var buttons = document.createElement("div");
		buttons.className = "omnidb-trp__buttons";
		var cancelButton = document.createElement("button");
		cancelButton.type = "button";
		cancelButton.className = "btn btn-sm omnidb__theme__btn--secondary";
		cancelButton.textContent = t("common.cancel");
		cancelButton.addEventListener("click", close);
		var applyButton = document.createElement("button");
		applyButton.type = "button";
		applyButton.className = "btn btn-sm omnidb__theme__btn--primary";
		applyButton.textContent = t("timerange.apply");
		buttons.append(cancelButton, applyButton);
		custom.appendChild(buttons);
		panel.appendChild(custom);

		// What the custom range starts out as: whatever is currently applied.
		var currentFrom = parseInputDate(fromInput.value, hoursAgo(6));
		var currentTo = parseInputDate(toInput.value, new Date());
		fromTime.value = toTimeString(currentFrom);
		toTime.value = toTimeString(currentTo);

		customItem.addEventListener("click", () => {
			if (calendar) return;
			custom.hidden = false;
			var lang = window.v_language || "en";
			calendar = new Calendar(calendarEl, {
				selectionDatesMode: "multiple-ranged",
				selectedDates: [toDayString(currentFrom), toDayString(currentTo)],
				selectedTheme: document.body.classList.contains("omnidb--theme-dark") ? "dark" : "light",
				locale: lang,
				firstWeekday: lang === "en" ? 0 : 1,
				enableDateToggle: false,
			});
			calendar.init();
		});

		applyButton.addEventListener("click", () => {
			var days = /** @type {string[]} */ (calendar?.selectedDates || []).slice().sort();
			if (!days.length) return;
			var from = fromDayAndTime(days[0], fromTime.value);
			var to = fromDayAndTime(days[days.length - 1], toTime.value, 59);
			if (to < from) [from, to] = [to, from];
			apply(from, to, () => setCustomLabel(label, from, to));
		});

		container.appendChild(panel);
		document.addEventListener("mousedown", onOutsideMouseDown, true);
		document.addEventListener("keydown", onKeyDown, true);
	}

	button.addEventListener("click", open);
}
