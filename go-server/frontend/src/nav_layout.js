// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// The layout of the left section rail: which items it shows, in what order,
/// and where the divider sits between its upper and lower part. The Settings
/// icon is not part of it -- it is always last and cannot be hidden. The
/// saved layout is a per-user document (see appdb_uiprefs.go); this module
/// turns it into a complete, consistent layout for the items that exist now,
/// so an item added by a later version, or one missing on this platform, can
/// never leave the saved layout broken.
/// </summary>

/** The divider between the rail's upper and lower part, as an entry of an order. */
export const NAV_DIVIDER = "|";

/** The rail's items in their default order, divider included. */
export const DEFAULT_NAV_ORDER = [
	"welcome",
	"connections",
	"database",
	"monitoring",
	"notify",
	"permissions",
	"connected_users",
	"schedules",
	"snippets",
	"bookmarks",
	NAV_DIVIDER,
	"getting_started",
	"account",
];

/**
 * @typedef {{ order: string[], hidden: string[] }} NavLayout
 */

/**
 * Resolves a saved layout against the items that exist on this platform.
 * Unknown and repeated entries are dropped; an item the saved layout does
 * not know goes where the default places it relative to its neighbours (the
 * end of the upper part, or of the lower part for an item the default puts
 * below the divider); exactly one divider remains.
 *
 * @param {string | NavLayout | null | undefined} saved  the stored JSON document, or its parsed form
 * @param {string[]} available  ids of the items that exist here
 * @returns {NavLayout}
 */
export function resolveNavLayout(saved, available) {
	/** @type {Partial<NavLayout>} */
	let parsed = {};
	try {
		parsed = typeof saved === "string" ? (saved ? JSON.parse(saved) : {}) : saved || {};
	} catch {
		parsed = {};
	}
	const known = new Set([...available, NAV_DIVIDER]);
	const savedOrder = Array.isArray(parsed.order) ? parsed.order : [];
	/** @type {string[]} */
	const order = [];
	for (const id of savedOrder) {
		if (typeof id === "string" && known.has(id) && !order.includes(id)) order.push(id);
	}

	const defaultDivider = DEFAULT_NAV_ORDER.indexOf(NAV_DIVIDER);
	const belowDefault = new Set(DEFAULT_NAV_ORDER.slice(defaultDivider + 1));
	if (!order.includes(NAV_DIVIDER)) {
		// A saved layout without a divider: put it where the default has it,
		// i.e. before the first item that belongs below it, else at the end.
		const firstBelow = order.findIndex((id) => belowDefault.has(id));
		order.splice(firstBelow < 0 ? order.length : firstBelow, 0, NAV_DIVIDER);
	}
	for (const id of DEFAULT_NAV_ORDER) {
		if (id === NAV_DIVIDER || !available.includes(id) || order.includes(id)) continue;
		if (belowDefault.has(id)) order.push(id);
		else order.splice(order.indexOf(NAV_DIVIDER), 0, id);
	}
	for (const id of available) {
		if (!order.includes(id)) order.splice(order.indexOf(NAV_DIVIDER), 0, id);
	}

	const hidden = Array.isArray(parsed.hidden)
		? parsed.hidden.filter((id, i, all) => typeof id === "string" && available.includes(id) && all.indexOf(id) === i)
		: [];
	return { order, hidden };
}

/**
 * Moves the entry at `index` by `delta` places (clamped to the list).
 * @param {string[]} order
 * @param {number} index
 * @param {number} delta
 * @returns {string[]} a new array
 */
export function moveNavEntry(order, index, delta) {
	const target = Math.max(0, Math.min(order.length - 1, index + delta));
	const out = order.slice();
	const [entry] = out.splice(index, 1);
	out.splice(target, 0, entry);
	return out;
}
