// @ts-check
/**
 * Guards the two ways src/legacy-globals.js can silently go wrong.
 *
 * The bridge copies each migrated module's exports onto `window` once, with
 * Object.assign. That is a snapshot, not a live binding, which is fine only
 * as long as nobody writes to the name afterwards:
 *
 *   1. Nothing OUTSIDE the bundle may assign to a bundled export. The write
 *      would land on `window` and the bundle would keep using its own
 *      unchanged module-local binding.
 *
 *   2. Nothing INSIDE the bundle may reassign an exported `var`/`let` that
 *      unmigrated code reads. The write updates the module-local binding and
 *      `window` keeps the stale original.
 *
 * Neither case exists today. This exists so that stays true for the rest of
 * the migration -- both failures are invisible at build time and produce a
 * wrong value rather than an error at runtime.
 *
 * It also checks a third thing, which is not about the bridge but fails the
 * same way -- silently, at build time, wrongly at runtime:
 *
 *   3. Every `declare let`/`declare var` in globals.d.ts must name a global
 *      something actually creates. Those declarations exist so tsc stops
 *      reporting "Cannot find name" for state the bundle does not own, and
 *      they have no runtime effect whatsoever. If nothing creates the global,
 *      the declaration silences the one warning that would have caught it, and
 *      a bare `name = value` in the bundle becomes a ReferenceError under
 *      strict mode -- which takes out the rest of the enclosing function.
 *      That is exactly how `v_current_os` killed shortcuts.js's whole ready
 *      handler, and with it every keyboard shortcut in the app.
 *
 * Matching is textual and deliberately over-eager: a hit inside a comment or
 * a string is a false positive, but a miss is a bug that ships.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const BUNDLE_SRC = here('../src')
const LEGACY_JS = here('../../static_assets/OmniDB_app/js')
const WORKSPACE_HTML = here('../../static/workspace.html')
const GLOBALS_DTS = here('../src/globals.d.ts')
const BOOTSTRAP_GLOBALS = here('../src/bootstrap-globals.js')

function jsFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...jsFiles(p))
    else if (entry.endsWith('.js')) out.push(p)
  }
  return out
}

const EXPORT_DECL = /^export\s+(function|var|let|const|class)\s+([A-Za-z_$][\w$]*)/gm
const assignRe = (name) => new RegExp(`(?<![\\w$.])${name}\\s*=(?!=)`, 'g')
const readRe = (name) => new RegExp(`(?<![\\w$.])${name}(?![\\w$])`)

const bundleFiles = jsFiles(BUNDLE_SRC).map((p) => [p, readFileSync(p, 'utf8')])
const legacyFiles = [
  ...jsFiles(LEGACY_JS).map((p) => [p, readFileSync(p, 'utf8')]),
  [WORKSPACE_HTML, readFileSync(WORKSPACE_HTML, 'utf8')],
]

/** @type {Map<string, string>} exported name -> declaration keyword */
const exported = new Map()
for (const [, src] of bundleFiles) {
  for (const m of src.matchAll(EXPORT_DECL)) exported.set(m[2], m[1])
}

const problems = []

for (const [name, kind] of exported) {
  for (const [path, src] of legacyFiles) {
    const hits = [...src.matchAll(assignRe(name))].length
    if (hits > 0) {
      problems.push(
        `${path}: assigns to "${name}", which is exported from the bundle.\n` +
          `    The bridge snapshots it onto window, so the bundle would never see the new value.`,
      )
    }
  }

  if (kind !== 'var' && kind !== 'let') continue

  // The declaration itself counts as one assignment when it has an initializer.
  let writes = 0
  for (const [, src] of bundleFiles) writes += [...src.matchAll(assignRe(name))].length
  if (writes <= 1) continue

  const readers = legacyFiles.filter(([, src]) => readRe(name).test(src)).map(([p]) => p)
  if (readers.length) {
    problems.push(
      `"${name}" is reassigned inside the bundle but read by ${readers.join(', ')}.\n` +
        `    window keeps the value from before the reassignment.`,
    )
  }
}

// --- 3. every `declare let`/`declare var` must name a global that exists -----
//
// `declare const` is excluded: those are the third-party libraries arriving as
// <script> tags from lib/, which this script cannot see and which are never
// assigned to anyway. The mutable group is where the hazard is.
const dts = readFileSync(GLOBALS_DTS, 'utf8')
const inlineScript = readFileSync(WORKSPACE_HTML, 'utf8')
const bootstrapSrc = readFileSync(BOOTSTRAP_GLOBALS, 'utf8')

const declaredInHtml = new Set(
  [...inlineScript.matchAll(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
)
const publishedByBootstrap = new Set(
  [...bootstrapSrc.matchAll(/^\s{2}([A-Za-z_$][\w$]*):/gm)].map((m) => m[1]),
)

for (const m of dts.matchAll(/^declare\s+(?:let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
  const name = m[1]
  if (declaredInHtml.has(name) || publishedByBootstrap.has(name)) continue
  problems.push(
    `globals.d.ts declares "${name}", but nothing creates that global.\n` +
      `    Not declared in static/workspace.html and not published by bootstrap-globals.js.\n` +
      `    An ambient declaration has no runtime effect: under strict mode a bare\n` +
      `    "${name} = ..." in the bundle throws ReferenceError. Either create the global,\n` +
      `    or make it a real export and import it.`,
  )
}

if (problems.length) {
  console.error(`legacy-globals bridge check failed (${problems.length}):\n`)
  for (const p of problems) console.error(`  - ${p}\n`)
  process.exit(1)
}

console.log(`legacy-globals bridge OK — ${exported.size} exported names checked`)
