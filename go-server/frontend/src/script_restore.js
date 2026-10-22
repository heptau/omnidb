// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Restore: run an SQL script (typically a table dump from the "Generate"
/// menu) from a file on the connection of a query tab, in one transaction.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";
import { t } from "./i18n.js";
import { showAlert, showConfirm } from "./notification_control.js";

/** Matches the server's request body cap with room for the JSON around the text. */
const MAX_SCRIPT_BYTES = 48 * 1024 * 1024;

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
	if (bytes < 1024) return bytes + " B";
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
	return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/**
 * Wires a toolbar button to a file picker that restores the chosen script.
 * @param {HTMLElement} p_button
 * @param {() => number} p_getConnId the connection the tab currently runs against
 * @param {() => string} p_getTabId
 */
export function installScriptRestore(p_button, p_getConnId, p_getTabId) {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = ".sql,.txt,text/plain,application/sql";
	input.style.display = "none";
	p_button.after(input);
	p_button.addEventListener("click", () => {
		input.value = "";
		input.click();
	});
	input.addEventListener("change", async () => {
		const file = input.files && input.files[0];
		if (!file) return;
		if (file.size > MAX_SCRIPT_BYTES) {
			showAlert(t("script.too_large", { mb: Math.round(MAX_SCRIPT_BYTES / (1024 * 1024)) }));
			return;
		}
		const script = await file.text();
		showConfirm(
			t("script.confirm", { file: file.name, size: formatSize(file.size) }),
			function () {
				execAjax(
					"/restore_script/",
					JSON.stringify({ p_database_index: p_getConnId(), p_tab_id: p_getTabId(), p_script: script }),
					function (/** @type {{ v_data: { v_statements: number } }} */ r) {
						showAlert(t("script.done", { count: r.v_data.v_statements }));
					},
					function (/** @type {{ v_data: any }} */ r) {
						const v_data = r.v_data;
						showAlert(typeof v_data === "string" ? v_data : (v_data && v_data.message) || t("errors.request_error"));
					},
					"box",
					true,
				);
			},
			null,
			null,
			null,
			t("script.run"),
		);
	});
}
