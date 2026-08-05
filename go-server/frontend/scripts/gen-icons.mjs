// Regenerates scss/_icons.scss, the Font Awesome replacement icon set.
// Run with: node scripts/gen-icons.mjs
//
// Each Font Awesome class this project used to load from lib/fa/ (a 3.1MB
// icon font) is re-rendered here as a small CSS mask rule: an inlined SVG
// data URI applied via mask-image, painted with background-color:
// currentColor. That means every existing `<i class="fas fa-edit">` call
// site (there are 1000+, scattered across tree_context_functions/*.js,
// context-menu item strings, and two Go-generated HTML strings) keeps
// working completely unchanged — only the CSS backing those class names
// changed, not the markup that references them.
//
// Shapes come from lucide-static (ISC license) — chosen for its thin,
// rounded, monoline stroke style, close in spirit to macOS/SF Symbols —
// except fa-github, the one genuine brand mark, which comes from
// simple-icons (CC0-1.0) instead of being hand-drawn.
//
// To add or change an icon: edit MAPPING below, then rerun this script.
// It depends on lucide-static/simple-icons only as devDependencies (icon
// *source material* at build time) — neither ships to the browser.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LUCIDE_DIR = join(__dirname, "../node_modules/lucide-static/icons");
const SIMPLE_DIR = join(__dirname, "../node_modules/simple-icons/icons");
const OUT_PATH = join(__dirname, "../scss/_icons.scss");

// fa-<name> -> ["lucide" | "simple", source file basename without .svg]
const MAPPING = {
	"fa-edit": ["lucide", "edit"],
	"fa-sync-alt": ["lucide", "refresh-cw"],
	"fa-times": ["lucide", "x"],
	"fa-globe-americas": ["lucide", "globe"],
	"fa-globe": ["lucide", "globe"],
	"fa-ellipsis-h": ["lucide", "ellipsis"],
	"fa-columns": ["lucide", "columns-3"],
	"fa-table": ["lucide", "table"],
	"fa-key": ["lucide", "key"],
	"fa-cog": ["lucide", "settings"],
	"fa-list": ["lucide", "list"],
	"fa-eye": ["lucide", "eye"],
	"fa-bolt": ["lucide", "zap"],
	"fa-search": ["lucide", "search"],
	"fa-terminal": ["lucide", "terminal"],
	"fa-chart-line": ["lucide", "chart-line"],
	"fa-hubspot": ["lucide", "network"],
	"fa-arrow-right": ["lucide", "arrow-right"],
	"fa-users": ["lucide", "users"],
	"fa-thumbtack": ["lucide", "pin"],
	"fa-user": ["lucide", "user"],
	"fa-th": ["lucide", "layout-grid"],
	"fa-chevron-down": ["lucide", "chevron-down"],
	"fa-check-circle": ["lucide", "check-circle"],
	"fa-plug": ["lucide", "plug"],
	"fa-chevron-right": ["lucide", "chevron-right"],
	"fa-server": ["lucide", "server"],
	"fa-exchange-alt": ["lucide", "arrow-left-right"],
	"fa-database": ["lucide", "database"],
	"fa-copy": ["lucide", "copy"],
	"fa-arrow-left": ["lucide", "arrow-left"],
	"fa-lightbulb": ["lucide", "lightbulb"],
	"fa-dot-circle": ["lucide", "circle-dot"],
	"fa-sort-numeric-down": ["lucide", "arrow-down-01"],
	"fa-sitemap": ["lucide", "workflow"],
	"fa-folder": ["lucide", "folder"],
	"fa-check": ["lucide", "check"],
	"fa-book": ["lucide", "book"],
	"fa-align-left": ["lucide", "align-left"],
	"fa-spell-check": ["lucide", "spell-check"],
	"fa-layer-group": ["lucide", "layers"],
	"fa-chart-bar": ["lucide", "bar-chart"],
	"fa-square": ["lucide", "square"],
	"fa-search-plus": ["lucide", "zoom-in"],
	"fa-save": ["lucide", "save"],
	"fa-question-circle": ["lucide", "help-circle"],
	"fa-plus": ["lucide", "plus"],
	"fa-broom": ["lucide", "brush"],
	"fa-arrow-alt-circle-down": ["lucide", "arrow-down-circle"],
	"fa-user-plus": ["lucide", "user-plus"],
	"fa-user-friends": ["lucide", "users-round"],
	"fa-tasks": ["lucide", "list-checks"],
	"fa-star": ["lucide", "star"],
	"fa-play-circle": ["lucide", "play-circle"],
	"fa-pause-circle": ["lucide", "pause-circle"],
	"fa-indent": ["lucide", "indent"],
	"fa-folder-open": ["lucide", "folder-open"],
	"fa-cubes": ["lucide", "boxes"],
	"fa-cube": ["lucide", "box"],
	"fa-code-branch": ["lucide", "git-branch"],
	"fa-check-square": ["lucide", "square-check"],
	"fa-times-circle": ["lucide", "x-circle"],
	"fa-sign-out-alt": ["lucide", "log-out"],
	"fa-info-circle": ["lucide", "info"],
	"fa-github": ["simple", "github"],
	"fa-eye-slash": ["lucide", "eye-off"],
	"fa-caret-down": ["lucide", "chevron-down"],
	"fa-calendar-alt": ["lucide", "calendar"],
	"fa-arrows-alt-v": ["lucide", "move-vertical"],
	"fa-arrow-alt-circle-up": ["lucide", "arrow-up-circle"],
	"fa-window-maximize": ["lucide", "app-window"],
	"fa-vector-square": ["lucide", "frame"],
	"fa-trash-alt": ["lucide", "trash-2"],
	"fa-search-minus": ["lucide", "zoom-out"],
	"fa-quote-left": ["lucide", "quote"],
	"fa-pen": ["lucide", "pen"],
	"fa-list-alt": ["lucide", "list"],
	"fa-link": ["lucide", "link"],
	"fa-hand-spock": ["lucide", "hand"],
	"fa-font": ["lucide", "type"],
	"fa-file": ["lucide", "file"],
	"fa-expand": ["lucide", "expand"],
	"fa-exclamation-triangle": ["lucide", "triangle-alert"],
	"fa-exclamation-circle": ["lucide", "circle-alert"],
	"fa-desktop": ["lucide", "monitor"],
	"fa-cut": ["lucide", "scissors"],
	"fa-bars": ["lucide", "menu"],
	"fa-balance-scale": ["lucide", "scale"],
	"fa-arrows-alt-h": ["lucide", "move-horizontal"],
	"fa-arrow-up": ["lucide", "arrow-up"],
};

function loadSvg(kind, name) {
	const dir = kind === "lucide" ? LUCIDE_DIR : SIMPLE_DIR;
	return readFileSync(join(dir, name + ".svg"), "utf8");
}

function normalize(svgText, kind) {
	svgText = svgText.replace(/<!--[\s\S]*?-->/g, "");
	if (kind === "lucide") {
		// A mask source has no notion of "currentColor" (there's no element
		// for it to inherit from inside a standalone data-URI SVG document)
		// — only the alpha channel matters for a mask, so the stroke just
		// needs to be fully opaque. The real on-screen color comes from
		// background-color: currentColor on the masked element itself.
		svgText = svgText.replace(/stroke="currentColor"/g, 'stroke="#000"');
		svgText = svgText.replace(/\s+class="[^"]*"/g, "");
		svgText = svgText.replace(/\s+width="24"/g, "");
		svgText = svgText.replace(/\s+height="24"/g, "");
	} else {
		svgText = svgText.replace(/<title>.*?<\/title>/g, "");
		svgText = svgText.replace(/\s+role="img"/g, "");
	}
	svgText = svgText.replace(/\s+/g, " ");
	svgText = svgText.replace(/>\s+</g, "><");
	return svgText.trim();
}

function toDataUri(svgText) {
	// The well-known "minimal encoding" trick for inline SVG data URIs:
	// percent-encode only the handful of characters that would otherwise
	// break out of a double-quoted CSS url(...) or confuse the data: URI
	// parser (%, #, ", <, >); everything else — including plain spaces —
	// is left as-is, which is far shorter than a full URI-encode or
	// base64 pass would produce.
	let out = svgText;
	out = out.replace(/%/g, "%25");
	out = out.replace(/#/g, "%23");
	out = out.replace(/"/g, "'");
	out = out.replace(/</g, "%3C");
	out = out.replace(/>/g, "%3E");
	return `data:image/svg+xml,${out}`;
}

const lines = [];
lines.push("// Auto-generated by frontend/scripts/gen-icons.mjs — do not hand-edit.");
lines.push('// Replaces the Font Awesome icon font: each .fa-<name> rule below renders');
lines.push("// the same glyph as a CSS mask (an inlined SVG data URI) over");
lines.push('// background-color: currentColor, so an unchanged `<i class="fas fa-x">`');
lines.push("// call site still gets a colored, theme-aware icon with zero font/JS cost.");
lines.push("// Shapes are sourced from lucide-static (ISC license) or, for the one real");
lines.push("// brand mark (fa-github), simple-icons (CC0-1.0).");
lines.push("");
lines.push(".fas, .far, .fab, .fa {");
lines.push("\tdisplay: inline-block;");
lines.push("\twidth: 1em;");
lines.push("\theight: 1em;");
lines.push("\tbackground-color: currentColor;");
lines.push("\t-webkit-mask-repeat: no-repeat;");
lines.push("\tmask-repeat: no-repeat;");
lines.push("\t-webkit-mask-position: center;");
lines.push("\tmask-position: center;");
lines.push("\t-webkit-mask-size: contain;");
lines.push("\tmask-size: contain;");
lines.push("\tvertical-align: -0.125em;");
lines.push("}");
lines.push("");

for (const faName of Object.keys(MAPPING).sort()) {
	const [kind, src] = MAPPING[faName];
	const raw = loadSvg(kind, src);
	const norm = normalize(raw, kind);
	const uri = toDataUri(norm);
	lines.push(`.${faName} {`);
	lines.push(`\t-webkit-mask-image: url("${uri}");`);
	lines.push(`\tmask-image: url("${uri}");`);
	lines.push("}");
}

const css = lines.join("\n") + "\n";
writeFileSync(OUT_PATH, css, "utf8");
console.log(`wrote ${OUT_PATH} — ${Object.keys(MAPPING).length} icons, ${css.length} bytes`);
