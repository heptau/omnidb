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

// The user-facing plugin system (the "Plugins" dialog, uploading a plugin
// package, calling into a plugin's Python function) was removed entirely —
// the Go backend never had a working equivalent of Django's dynamic
// importlib-based plugin loading (see plugins_stub.go's history/AGENTS.md),
// so the dialog only ever showed an empty list and any upload attempt
// always failed.
//
// This file now only keeps the internal hook registry those (former)
// plugins would have populated via activateHook() — six tree_context_functions
// files and workspace.js/header_actions.js still check
// `v_connTabControl.tag.hooks.<name>.length > 0` before firing registered
// callbacks. Since nothing can ever call activateHook() anymore, every one
// of those checks is now permanently false — dead but harmless, and not
// worth touching two dozen call sites across seven files to remove for zero
// behavior change. Kept as a real (if currently unused) extension point
// rather than deleted outright, in case internal code ever wants to hook
// into these events itself.
function initHookRegistry() {
	// v_connTabControl is only created once login succeeds, which can still be
	// in flight when this fires (e.g. an automated/instant login submit) --
	// jQuery's ready queue happened to swallow that race silently; this just
	// waits it out explicitly instead of throwing on the first attempt.
	if (typeof v_connTabControl === "undefined" || !v_connTabControl.tag) {
		setTimeout(initHookRegistry, 50);
		return;
	}
	v_connTabControl.tag.hooks = {
		innerTabMenu: [],
		outerTabMenu: [],
		windowResize: [],
		changeTheme: [],
		postgresqlTreeNodeOpen: [],
		postgresqlTreeContextMenu: [],
		postgresqlTreeNodeClick: [],
		oracleTreeNodeOpen: [],
		oracleTreeContextMenu: [],
		oracleTreeNodeClick: [],
		mysqlTreeNodeOpen: [],
		mysqlTreeContextMenu: [],
		mysqlTreeNodeClick: [],
		mariadbTreeNodeOpen: [],
		mariadbTreeContextMenu: [],
		mariadbTreeNodeClick: [],
		sqliteTreeNodeOpen: [],
		sqliteTreeContextMenu: [],
		sqliteTreeNodeClick: [],
	};
}

// jQuery's $(fn) always defers to a fresh task even when the document is
// already ready (it never calls fn synchronously inline) -- match that here,
// since other module-level code later in this same bundle (e.g. workspace.js
// creating v_connTabControl) depends on running before this fires.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initHookRegistry);
else setTimeout(initHookRegistry, 0);

export function activateHook(p_hook, p_function) {
	try {
		v_connTabControl.tag.hooks[p_hook].push(p_function);
	} catch (err) {}
}
