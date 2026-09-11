// @ts-check
/**
 * Client-side translation helpers, mirroring the Go i18n package
 * (go-server/i18n/i18n.go): a flat "namespace.key" catalog, "{name}"
 * placeholder interpolation, and the same small plural rule (Czech
 * one/few/other, English/Spanish one/other -- see pluralSuffix).
 *
 * window.v_language/window.v_i18n are published by bootstrap-globals.js for
 * the workspace page (see main.js's import order). login.html has no such
 * bundle -- readLoginBootstrap below fills in the same two globals from its
 * own, much smaller "#omnidb_login_i18n" JSON blob instead (see
 * renderLoginPageForRequest in native_login.go).
 *
 * Deliberately no top-level side effects in this module: it is imported for
 * t()/tn() alone from files that end up bundled more than once (e.g.
 * ajax_control.js, which early.js/login.js and the main bundle each get their
 * own separate copy of -- see early.js's comment). Running readLoginBootstrap/
 * applyStaticI18n as an import-time side effect would then fire once per
 * bundle that happens to reach this file, in whatever order Vite loads them,
 * rather than exactly once at the right point in the page's own script
 * order. initI18n() below is the one function with side effects, called
 * explicitly by main.js/login.js only.
 */

function readLoginBootstrap() {
	if (typeof v_i18n !== "undefined" && v_i18n) return;
	var el = document.getElementById("omnidb_login_i18n");
	if (!el || !el.textContent) return;
	var cfg = JSON.parse(el.textContent);
	window.v_language = cfg.language;
	window.v_i18n = cfg.i18n;
}

/**
 * @param {string} s
 * @param {Record<string, string | number>} [vars]
 */
function interpolate(s, vars) {
	if (!vars) return s;
	return s.replace(/\{(\w+)\}/g, function (whole, name) {
		return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
	});
}

/// <summary>
/// Translates key using the resolved-language dictionary the server sent
/// (window.v_i18n), interpolating any "{name}" placeholders from vars. Falls
/// back to the key itself (with a console.warn) if the key is missing from
/// that dictionary entirely -- it already has English filled in for anything
/// missing just from the target language (see i18n.CatalogFor on the Go
/// side), so reaching this fallback means the key was never added to en.json
/// at all, a real authoring bug worth surfacing during QA.
/// </summary>
/**
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 * @returns {string}
 */
export function t(key, vars) {
	var dict = typeof v_i18n !== "undefined" ? v_i18n : null;
	var template = dict && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : undefined;
	if (template === undefined) {
		console.warn('i18n: missing translation key "' + key + '"');
		template = key;
	}
	return interpolate(template, vars);
}

/**
 * @param {string} lang
 * @param {number} n
 * @returns {"one" | "few" | "other"}
 */
function pluralSuffix(lang, n) {
	if (lang === "cs") {
		if (n === 1) return "one";
		if (n >= 2 && n <= 4) return "few";
		return "other";
	}
	return n === 1 ? "one" : "other";
}

/// <summary>
/// Translates a plural-bearing key, picking "{key}.one" / "{key}.few" /
/// "{key}.other" for n according to the current language's plural rule (see
/// pluralSuffix), falling back to "{key}.other" if that specific form isn't
/// in the dictionary. "{n}" is interpolated automatically alongside vars.
/// </summary>
/**
 * @param {string} key
 * @param {number} n
 * @param {Record<string, string | number>} [vars]
 * @returns {string}
 */
export function tn(key, n, vars) {
	var lang = typeof v_language !== "undefined" && v_language ? v_language : "en";
	var dict = typeof v_i18n !== "undefined" ? v_i18n : null;
	var fullKey = key + "." + pluralSuffix(lang, n);
	if (!dict || !Object.prototype.hasOwnProperty.call(dict, fullKey)) {
		fullKey = key + ".other";
	}
	var fullVars = Object.assign({ n: n }, vars);
	return t(fullKey, fullVars);
}

/// <summary>
/// Fills in every element carrying a `data-i18n*` attribute from
/// window.v_i18n -- the declarative counterpart to t()/tn() for
/// workspace.html/login.html's own static markup. Runs once at page load
/// (see the bottom of this module); a later language change always reloads
/// the page instead of re-running this (see changeLanguagePreference in
/// header_actions.js), since workspace.html's markup was server-rendered for
/// whatever language was active *before* the switch, not just its
/// data-i18n-tagged text -- so there is no "update in place" path to keep in
/// sync here.
/// </summary>
export function applyStaticI18n() {
	if (typeof v_language !== "undefined" && v_language) {
		document.documentElement.setAttribute("lang", v_language);
	}
	// login.scss's empty-field indicator generates its " (empty)" text via a
	// ::after pseudo-element, which data-i18n can't reach directly (there's no
	// DOM node to set textContent/an attribute on) -- a CSS custom property is
	// the one bridge from JS into `content:`. JSON.stringify produces a valid
	// double-quoted CSS string for this plain-ASCII value.
	document.documentElement.style.setProperty("--i18n-empty-suffix", JSON.stringify(" (" + t("login.empty_suffix") + ")"));
	document.querySelectorAll("[data-i18n]").forEach(function (el) {
		var key = el.getAttribute("data-i18n");
		if (key) el.textContent = t(key);
	});
	["title", "placeholder", "aria-label", "alt", "label"].forEach(function (attr) {
		document.querySelectorAll("[data-i18n-" + attr + "]").forEach(function (el) {
			var key = el.getAttribute("data-i18n-" + attr);
			if (key) el.setAttribute(attr, t(key));
		});
	});
}

/// <summary>
/// Call exactly once, from the page's own entry bundle (main.js for
/// workspace.html, login.js for login.html) -- see this module's top comment
/// for why every other file just imports t()/tn() with no side effects.
/// </summary>
export function initI18n() {
	readLoginBootstrap();
	applyStaticI18n();
}
