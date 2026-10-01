// @ts-check
import { execAjax } from "./ajax_control.js";
import { createRequest } from "./long_polling.js";
import { v_queryRequestCodes } from "./query.js";

// Query-tab persistence: tab title/editor text are autosaved to the app db
// (OmniDB_app_tab) shortly after every change, not only when a query runs,
// and the last selected tab is remembered so it can be re-selected on restore.

const AUTOSAVE_DELAY_MS = 500;
const LAST_TAB_KEY = "omnidb.lastQueryTab";

/** @param {any} p_tag inner query tab's tag */
export function scheduleTabSave(p_tag) {
	if (p_tag.closed) return;
	if (p_tag.save_timer) clearTimeout(p_tag.save_timer);
	p_tag.save_timer = setTimeout(function () {
		p_tag.save_timer = null;
		saveTabNow(p_tag);
	}, AUTOSAVE_DELAY_MS);
}

/** @param {any} p_tag */
export function saveTabNow(p_tag) {
	if (p_tag.closed || !p_tag.editor) return;
	if (p_tag.save_in_flight) {
		p_tag.save_pending = true;
		return;
	}
	var v_snippet = p_tag.editor.getValue();
	var v_title = p_tag.tab_title_span.textContent;
	if (v_snippet === p_tag.saved_snippet && v_title === p_tag.saved_title) return;
	p_tag.save_in_flight = true;
	execAjax(
		"/save_tab/",
		JSON.stringify({
			p_tab_db_id: p_tag.tab_db_id || null,
			p_conn_id: p_tag.connTab.tag.selectedDatabaseIndex,
			p_title: v_title,
			p_snippet: v_snippet,
		}),
		function (p_return) {
			p_tag.save_in_flight = false;
			p_tag.saved_snippet = v_snippet;
			p_tag.saved_title = v_title;
			var v_id = p_return.v_data.tab_db_id;
			if (p_tag.closed) {
				// Tab was closed while this save was in flight: don't leave its row behind.
				if (!p_tag.tab_db_id) createRequest(v_queryRequestCodes.CloseTab, [{ tab_id: p_tag.tab_id, tab_db_id: v_id }]);
				return;
			}
			if (!p_tag.tab_db_id) p_tag.tab_db_id = v_id;
			if (p_tag.save_pending) {
				p_tag.save_pending = false;
				saveTabNow(p_tag);
			}
		},
		function () {
			p_tag.save_in_flight = false;
			p_tag.save_pending = false;
		},
		"box",
		false,
		null,
		function () {
			// Network failure: autosave is best-effort, retried on the next edit.
			p_tag.save_in_flight = false;
			p_tag.save_pending = false;
		},
	);
}

/// Remembers which query tab is selected (connection + saved tab id).
/** @param {any} p_tag inner query tab's tag */
export function rememberActiveTab(p_tag) {
	try {
		localStorage.setItem(
			LAST_TAB_KEY,
			JSON.stringify({ conn: p_tag.connTab.tag.selectedDatabaseIndex, tab_db_id: p_tag.tab_db_id || null }),
		);
	} catch (e) {
		// storage unavailable -- restoring the last tab is best-effort
	}
}

/** @returns {{conn: number, tab_db_id: number|null}|null} */
export function recallActiveTab() {
	try {
		return JSON.parse(localStorage.getItem(LAST_TAB_KEY) || "null");
	} catch (e) {
		return null;
	}
}
