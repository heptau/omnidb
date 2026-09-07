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

/// <summary>
/// The channel tree of one Notify tab (see panel_functions/outer_notify_panel.js).
/// The channel list itself is persisted server-side, so every action here is a
/// plain REST call followed by a refresh -- unlike the messages, which never
/// leave the browser.
/// </summary>

import { execAjax } from "../ajax_control_bridge.js";
import { showConfirm } from "../notification_control.js";
import {
	clearNotifyChannelMessages,
	renderNotifyFilter,
	renderNotifyMessages,
} from "../panel_functions/outer_notify_panel.js";

var NOTIFY_ICON_ACTIVE = "fas node-all fa-bell";
var NOTIFY_ICON_PAUSED = "fas node-all fa-bell-slash";

/// <summary>
/// Building the tree for one Notify tab.
/// </summary>
/// <param name="p_tag">Notify tab tag.</param>
export function getTreeNotifyChannels(p_tag) {
	var context_menu = {
		cm_notify_root: {
			elements: [
				{
					text: "Add Channel",
					icon: "fas cm-all fa-plus",
					action: function (node) {
						promptAddChannel(p_tag);
					},
				},
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						refreshNotifyChannels(p_tag);
					},
				},
			],
		},
		cm_notify_channel: {
			// A function rather than a static array (Aimara.js's
			// nodeContextMenu supports both): customMenu has no per-item
			// "visible" predicate, so Pause/Resume has to be decided here,
			// once per right-click, from the node's own state.
			elements: function (p_node) {
				var v_elements = [];

				if (p_node.tag.active) {
					v_elements.push({
						text: "Pause",
						icon: "fas cm-all fa-pause",
						action: function (node) {
							pauseChannel(p_tag, node);
						},
					});
				} else {
					v_elements.push({
						text: "Resume",
						icon: "fas cm-all fa-play",
						action: function (node) {
							resumeChannel(p_tag, node);
						},
					});
				}

				v_elements.push({
					text: "Clear Messages",
					icon: "fas cm-all fa-eraser",
					action: function (node) {
						clearNotifyChannelMessages(p_tag, node.tag.name);
					},
				});

				v_elements.push({
					text: "Delete",
					icon: "fas cm-all fa-times",
					action: function (node) {
						deleteChannel(p_tag, node);
					},
				});

				return v_elements;
			},
		},
	};

	var tree = createTree(p_tag.divTree.id, "#fcfdfd", context_menu);
	tree.tag = {};

	var node1 = tree.createNode(
		"Channels",
		true,
		NOTIFY_ICON_ACTIVE,
		null,
		// locked: true stops this root from being collapsed (see Aimara.js's
		// collapseNode) -- the panel has nothing else to show in its place.
		{ type: "notify_root", locked: true },
		"cm_notify_root",
	);

	tree.drawTree();

	// Right-clicking the empty space under the last channel reaches the
	// root's own menu (Add Channel/Refresh). createTree sets this handler to
	// just `return false`, which is only good enough for a tree where every
	// useful action hangs off a node row -- see tree_snippets.js for the same
	// reasoning. Aimara's per-node oncontextmenu calls stopPropagation(), so
	// this never fires for a channel row.
	/** @type {HTMLElement} */ (document.getElementById(p_tag.divTree.id)).oncontextmenu = function (e) {
		e.preventDefault();
		tree.nodeContextMenu(e, node1);
	};

	// Mirrors the per-node oncontextmenu handling above: clicking a row also
	// counts as selecting it (Aimara calls this before its own selectNode),
	// which is what drives the footer's "-" button (see
	// outer_notify_panel.js's buildNotifyTabLayout) -- only an actual channel
	// row is something that button can act on.
	tree.clickNodeEvent = function (p_node) {
		updateNotifySelectedChannel(p_tag, p_node.tag && p_node.tag.type === "notify_channel" ? p_node : null);
	};

	p_tag.tree = tree;
	p_tag.treeRootNode = node1;

	refreshNotifyChannels(p_tag);
}

/// <summary>
/// Tracks the channel row the footer's "-" button would act on, enabling it
/// only while that's an actual channel (not the root, not nothing).
/// </summary>
function updateNotifySelectedChannel(p_tag, p_node) {
	p_tag.selectedChannelNode = p_node;
	if (p_tag.divDeleteChannelBtn == null) return;
	if (p_node != null) p_tag.divDeleteChannelBtn.removeAttribute("disabled");
	else p_tag.divDeleteChannelBtn.setAttribute("disabled", "disabled");
}

/// <summary>
/// Normalizes one /get_notify_channels/ response into the {id, name, active}
/// shape the panel works with.
/// </summary>
function notifyChannelsFromReturn(p_return) {
	var v_data = p_return.v_data;
	var v_list = Array.isArray(v_data) ? v_data : (v_data && v_data.v_channels) || [];

	var v_channels = [];
	for (var i = 0; i < v_list.length; i++) {
		var v_row = v_list[i];
		v_channels.push({
			id: v_row.v_id,
			name: v_row.v_channel_name,
			// The paused/active flag is the one field of this row the wire
			// format never spelled out -- read either spelling rather than
			// silently showing every channel as active.
			active: v_row.v_active !== undefined ? !!v_row.v_active : !!v_row.active,
		});
	}
	return v_channels;
}

/// <summary>
/// Retrieving the persisted channel list for this tab's connection.
/// </summary>
/// <param name="p_tag">Notify tab tag.</param>
export function refreshNotifyChannels(p_tag) {
	execAjax(
		"/get_notify_channels/",
		JSON.stringify({ p_conn_id: p_tag.connID }),
		function (p_return) {
			p_tag.channels = notifyChannelsFromReturn(p_return);
			renderNotifyChannelNodes(p_tag);
			renderNotifyFilter(p_tag);
			renderNotifyMessages(p_tag);
		},
		null,
		"box",
		false,
	);
}

/// <summary>
/// (Re)draws the channel nodes from p_tag.channels. A channel is only drawn
/// as active if the live session is actually running -- a session the backend
/// stopped leaves every channel visibly inactive until it is restarted.
/// </summary>
/// <param name="p_tag">Notify tab tag.</param>
export function renderNotifyChannelNodes(p_tag) {
	if (p_tag == null || p_tag.treeRootNode == null) return;

	// Every child node gets torn down and rebuilt below -- whatever was
	// selected (see updateNotifySelectedChannel) no longer exists, so the
	// footer's "-" button must not be left pointing at a stale node.
	updateNotifySelectedChannel(p_tag, null);

	p_tag.treeRootNode.removeChildNodes();

	var v_channels = p_tag.channels || [];
	for (var i = 0; i < v_channels.length; i++) {
		var v_active = v_channels[i].active && !p_tag.sessionStopped;
		p_tag.treeRootNode.createChildNode(
			v_channels[i].name,
			false,
			v_active ? NOTIFY_ICON_ACTIVE : NOTIFY_ICON_PAUSED,
			{
				type: "notify_channel",
				id: v_channels[i].id,
				name: v_channels[i].name,
				active: v_channels[i].active,
			},
			"cm_notify_channel",
		);
	}
}

export function promptAddChannel(p_tag) {
	showConfirm(
		"",
		function () {
			execAjax(
				"/add_notify_channel/",
				JSON.stringify({
					p_conn_id: p_tag.connID,
					p_channel_name: /** @type {HTMLInputElement} */ (document.getElementById("element_name")).value,
					p_tab_id: p_tag.tab_id,
				}),
				function (p_return) {
					refreshNotifyChannels(p_tag);
				},
				null,
				"box",
			);
		},
		null,
		function () {
			// Built as a real DOM node, not an HTML string — showConfirm's
			// content div only renders plain text (see notification_control.js).
			var v_input = document.createElement("input");
			v_input.id = "element_name";
			v_input.className = "form-control";
			v_input.placeholder = "Channel Name";
			v_input.style.width = "100%";
			/** @type {HTMLElement} */ (document.getElementById("modal_message_content")).appendChild(v_input);

			v_input.onkeydown = function () {
				if (/** @type {any} */ (event).keyCode == 13)
						/** @type {HTMLElement} */ (document.getElementById("modal_message_ok")).click();
				else if (/** @type {any} */ (event).keyCode == 27)
						/** @type {HTMLElement} */ (document.getElementById("modal_message_cancel")).click();
			};
			v_input.focus();
		},
	);
}

export function pauseChannel(p_tag, p_node) {
	execAjax(
		"/pause_notify_channel/",
		JSON.stringify({ p_id: p_node.tag.id, p_tab_id: p_tag.tab_id }),
		function (p_return) {
			refreshNotifyChannels(p_tag);
		},
		null,
		"box",
	);
}

export function resumeChannel(p_tag, p_node) {
	execAjax(
		"/resume_notify_channel/",
		JSON.stringify({ p_id: p_node.tag.id, p_tab_id: p_tag.tab_id }),
		function (p_return) {
			refreshNotifyChannels(p_tag);
		},
		null,
		"box",
	);
}

export function deleteChannel(p_tag, p_node) {
	var v_channel_name = p_node.tag.name;

	showConfirm(
		"Are you sure you want to delete this channel?",
		function () {
			execAjax(
				"/delete_notify_channel/",
				JSON.stringify({ p_id: p_node.tag.id, p_tab_id: p_tag.tab_id }),
				function (p_return) {
					// A deleted channel takes its already-received messages
					// with it -- they can never be refreshed back, and leaving
					// them behind under a channel that no longer exists would
					// also strand them behind an unreachable filter checkbox.
					clearNotifyChannelMessages(p_tag, v_channel_name);
					refreshNotifyChannels(p_tag);
				},
				null,
				"box",
			);
		},
		null,
		function () {
			var v_input = /** @type {HTMLElement} */ (document.getElementById("modal_message_ok"));
			v_input.focus();
		},
	);
}
