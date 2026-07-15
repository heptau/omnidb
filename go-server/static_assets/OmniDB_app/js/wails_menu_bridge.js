// Listens for native menu clicks emitted by the Wails desktop shell
// (wails-app/menu.go) and dispatches them to the exact same jQuery
// functions the in-page toolbar already uses — no separate UI, just a
// second way to trigger it. A no-op when this page is loaded in a plain
// browser (server/network deployment, no Wails runtime involved): every
// handler bails out if window.runtime isn't present, so this file is safe
// to load unconditionally.
(function () {
	if (typeof window === "undefined" || !window.runtime || typeof window.runtime.EventsOn !== "function") return;

	function toggleSelectedTabTreeTabs() {
		if (!v_connTabControl.selectedTab) return;
		var v_tab_id = v_connTabControl.selectedTab.id;
		toggleTreeTabsContainer("tree_tabs_parent_" + v_tab_id, v_tab_id + "_left_resize_line_horizontal");
	}

	var v_handlers = {
		"menu:about": function () {
			showAbout();
		},
		"menu:settings": function () {
			showConfigUser();
		},
		"menu:connections": function () {
			startConnectionManagement();
		},
		"menu:snippets": function () {
			toggleSnippetPanel();
		},
		"menu:plugins": function () {
			showPlugins();
		},
		"menu:switch-menu": function () {
			v_connTabControl.toggleTabMenu();
			refreshHeights();
		},
		"menu:toggle-tree": function () {
			toggleTreeContainer();
		},
		"menu:toggle-tree-tabs": function () {
			toggleSelectedTabTreeTabs();
		},
		"menu:getting-started": function () {
			startTutorial("getting_started");
		},
		"menu:shortcuts": function () {
			showConfigUser();
			$('a[href="#config_shortcuts"]').trigger("click");
		},
	};

	Object.keys(v_handlers).forEach(function (v_event_name) {
		window.runtime.EventsOn(v_event_name, v_handlers[v_event_name]);
	});
})();
