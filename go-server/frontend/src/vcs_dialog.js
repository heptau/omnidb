// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Version control of OmniDB's definitions: snippets, custom monitoring units
/// and scheduled queries are written to a git repository folder as plain files
/// and committed, or read back from one. In the desktop app the folder is
/// chosen in a native picker (the only way the sandboxed macOS app may reach
/// it); on a server it is typed in. Pushing and pulling are left to the
/// user's own git workflow.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";
import { t } from "./i18n.js";
import { setMessageModalTitle, showAlert, showConfirm } from "./notification_control.js";
import { refreshTreeSnippets } from "./tree_context_functions/tree_snippets.js";

const STORAGE_KEY = "omnidb.vcs_dir";
const KINDS = ["snippets", "monitoring", "schedules"];

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

function savedDir() {
	try {
		return localStorage.getItem(STORAGE_KEY) || "";
	} catch {
		return "";
	}
}

/** @param {string} dir */
function rememberDir(dir) {
	try {
		localStorage.setItem(STORAGE_KEY, dir);
	} catch {
		// Private window or blocked storage: the folder is simply not remembered.
	}
}

/**
 * @param {object} body
 * @param {(data: any) => void} done
 * @param {() => void} [failed]  runs after the error has been shown
 */
function call(body, done, failed) {
	execAjax(
		"/vcs/",
		JSON.stringify(body),
		(/** @type {{ v_data: any }} */ r) => done(r.v_data),
		(/** @type {{ v_data: any }} */ r) => {
			const text = typeof r.v_data === "string" ? r.v_data : (r.v_data && r.v_data.message) || t("errors.request_error");
			showAlert(text.charAt(0).toUpperCase() + text.slice(1));
			if (failed) failed();
		},
		"box",
		false,
	);
}

/**
 * @param {any} [snippetsRoot]  the snippets tree's root node, refreshed after an import
 */
export function openVcsDialog(snippetsRoot) {
	const dir = /** @type {HTMLInputElement} */ (el("input", "form-control form-control-sm"));
	dir.type = "text";
	dir.placeholder = t("vcs.dir_placeholder");
	dir.value = savedDir();
	const choose = /** @type {HTMLButtonElement} */ (el("button", "btn btn-sm omnidb__theme__btn--secondary flex-shrink-0", t("vcs.choose")));
	choose.type = "button";
	choose.style.display = "none";
	const folderRow = el("div", "d-flex gap-2 align-items-center");
	dir.classList.add("flex-grow-1");
	folderRow.append(dir, choose);
	const message = /** @type {HTMLInputElement} */ (el("input", "form-control form-control-sm"));
	message.type = "text";
	message.placeholder = t("vcs.message_placeholder");
	const state = el("pre", "p-2 small mb-3");
	state.style.cssText = "max-height:24vh;overflow:auto;white-space:pre-wrap;border:1px solid var(--border-color);";
	const buttons = el("div", "d-flex flex-wrap gap-2 mb-3");
	const defaultNote = el("div", "small text-muted mt-1", t("vcs.default_folder"));
	defaultNote.style.display = "none";
	let managed = false;
	// Resolves once the folder question has been answered: in the desktop app
	// that is a round trip to the shell, so an early click on Commit/Import
	// must wait for it instead of finding the folder still blank.
	/** @type {() => void} */
	let folderKnown = () => {};
	const folderReady = new Promise((resolve) => {
		folderKnown = () => resolve(undefined);
	});

	/** @type {Record<string, HTMLInputElement>} */
	const kindBoxes = {};
	const kindsRow = el("div", "d-flex flex-column gap-1");
	for (const kind of KINDS) {
		const wrap = el("label", "d-flex align-items-center gap-2");
		const box = /** @type {HTMLInputElement} */ (el("input", "form-check-input m-0"));
		box.type = "checkbox";
		box.checked = true;
		kindBoxes[kind] = box;
		wrap.append(box, document.createTextNode(t("vcs.kind_" + kind)));
		kindsRow.appendChild(wrap);
	}
	const selectedKinds = () => KINDS.filter((k) => kindBoxes[k].checked);
	const folder = () => (managed ? "" : dir.value.trim());
	const haveFolder = () => managed || dir.value.trim() !== "";

	/** @param {any} st */
	const showState = (st) => {
		if (!st.is_repo) {
			state.textContent = t("vcs.not_repo");
			return;
		}
		const lines = [t("vcs.branch", { branch: st.branch }), ""];
		lines.push(st.changes.length ? t("vcs.changes", { count: st.changes.length }) : t("vcs.clean"));
		lines.push(...st.changes, "", t("vcs.log"), ...st.log);
		state.textContent = lines.join("\n");
	};
	const check = () => {
		if (!haveFolder()) {
			state.textContent = t("vcs.folder_none");
			return;
		}
		if (!managed) rememberDir(folder());
		call({ p_action: "status", p_dir: folder() }, showState);
	};
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
	button(t("vcs.check"), check);
	button(t("vcs.init"), async () => {
		await folderReady;
		if (!haveFolder()) return showAlert(t("vcs.need_dir"));
		if (!managed) rememberDir(folder());
		call({ p_action: "init", p_dir: folder() }, showState);
	});
	button(t("vcs.import"), async () => {
		await folderReady;
		if (!haveFolder()) return showAlert(t("vcs.need_dir"));
		if (selectedKinds().length === 0) return showAlert(t("vcs.need_kind"));
		if (!managed) rememberDir(folder());
		call({ p_action: "import", p_dir: folder(), p_kinds: selectedKinds() }, (/** @type {Record<string, any>} */ r) => {
			state.textContent = Object.entries(r)
				.map(([name, res]) => t("vcs.imported", { name: t("vcs.kind_" + name), ...res }))
				.join("\n");
			if (snippetsRoot && r.snippets) refreshTreeSnippets(snippetsRoot);
		});
	});

	choose.addEventListener("click", () =>
		call({ p_action: "choose_folder" }, (/** @type {{ path: string, cancelled: boolean }} */ r) => {
			if (r.cancelled) return;
			dir.value = r.path || "";
			defaultNote.style.display = "none";
			check();
		}),
	);

	/**
	 * @param {string} key
	 * @param {HTMLElement[]} controls
	 */
	const field = (key, ...controls) => {
		const w = el("div", "mb-3");
		w.append(el("label", "form-label small fw-bold mb-1", t(key)), ...controls);
		return w;
	};

	showConfirm(
		"",
		async function () {
			await folderReady;
			if (!haveFolder()) return showAlert(t("vcs.need_dir"));
			if (selectedKinds().length === 0) return showAlert(t("vcs.need_kind"));
			if (!managed) rememberDir(folder());
			call({ p_action: "commit", p_dir: folder(), p_kinds: selectedKinds(), p_message: message.value }, (/** @type {{ result: string }} */ r) => {
				showAlert(r.result === "nothing to commit" ? t("vcs.nothing") : t("vcs.committed", { commit: r.result }));
			});
		},
		null,
		function () {
			setMessageModalTitle(t("vcs.title"));
			const content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));
			content.style.whiteSpace = "normal";
			content.innerHTML = "";
			content.append(field("vcs.dir", folderRow, defaultNote), field("vcs.kinds", kindsRow), buttons, state, field("vcs.message", message), el("div", "small text-muted", t("vcs.hint")));
			// In the desktop app the shell owns the folder: show it read-only
			// with a picker button; elsewhere the path is typed.
			dir.placeholder = t("vcs.loading");
			call({ p_action: "folder" }, (/** @type {{ managed: boolean, path: string, default: boolean }} */ r) => {
				dir.placeholder = t("vcs.dir_placeholder");
				managed = r.managed;
				if (managed) {
					dir.readOnly = true;
					dir.value = r.path || "";
					dir.placeholder = t("vcs.folder_none");
					choose.style.display = "";
					defaultNote.style.display = r.default ? "" : "none";
				}
				folderKnown();
				check();
			}, folderKnown);
		},
		true,
		t("vcs.commit"),
	);
}
