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

if (problems.length) {
  console.error(`legacy-globals bridge check failed (${problems.length}):\n`)
  for (const p of problems) console.error(`  - ${p}\n`)
  process.exit(1)
}

console.log(`legacy-globals bridge OK — ${exported.size} exported names checked`)
