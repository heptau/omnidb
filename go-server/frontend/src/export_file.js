// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

The MIT License (MIT)

Portions Copyright (c) 2015-2026, The OmniDB Team
Portions Copyright (c) 2017-2026, 2ndQuadrant Limited
Portions Copyright (c) 2025-2026, Zbyněk Vanžura

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/**
 * Hands a freshly generated export file (see newExportTempFile on the Go side)
 * to the user: a native Save dialog in the desktop app (through
 * /export_save_dialog/, the same flow the query-export toolbar uses), a
 * Download/Cancel prompt in the browser -- Cancel discards the temp file via
 * /discard_export_file/ rather than leaving it for cleanTempFolder's 24h
 * sweep.
 */

import { t } from "./i18n.js";
import { execAjax, jsonPostHeaders } from "./ajax_control_bridge.js";
import { showAlert, showConfirm } from "./notification_control.js";

/**
 * @param {{v_filename: string, v_filepath: string, v_downloadname: string}} p_data a handler's export response
 */
export function deliverExportFile(p_data) {
	if (!gv_desktopMode) {
		showConfirm(
			t("editor.file_ready"),
			function () {
				var v_a = document.createElement("a");
				v_a.href = p_data.v_filename;
				v_a.download = p_data.v_downloadname;
				document.body.appendChild(v_a);
				v_a.click();
				v_a.remove();
			},
			function () {
				execAjax("/discard_export_file/", JSON.stringify({ v_filepath: p_data.v_filepath }), null, null, "box", false);
			},
			null,
			null,
			t("common.download"),
		);
		return;
	}

	fetch("/export_save_dialog/", {
		method: "POST",
		headers: jsonPostHeaders(),
		body: JSON.stringify({ v_filepath: p_data.v_filepath, v_downloadname: p_data.v_downloadname }),
	})
		.then(function (p_response) {
			return p_response.json();
		})
		.then(function (p_result) {
			if (p_result.error) showAlert(t("editor.error_saving_file", { error: p_result.error }));
			else if (p_result.path) showAlert(t("editor.file_exported_to", { path: p_result.path }));
		})
		.catch(function (p_error) {
			showAlert(t("editor.error_saving_file", { error: p_error }));
		});
}
