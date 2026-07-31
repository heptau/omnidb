/**
 * Re-publishes bundled modules onto `window`.
 *
 * Before the Vite build, every one of these files was its own <script> tag,
 * so each top-level `function foo()` became `window.foo` for free. Two things
 * still rely on that:
 *
 *   1. the files that have not been migrated yet, which call across to
 *      migrated ones by bare name;
 *   2. the `onclick="..."` attributes in workspace.html, which are evaluated
 *      against the global scope no matter what.
 *
 * Inside the bundle the files share one function scope, so they can still see
 * each other directly -- it is only the outside world that loses them. This
 * puts them back.
 *
 * Every export of every migrated module is exposed, without a hand-maintained
 * allowlist: the goal at this stage is to be indistinguishable from the
 * <script> tags being replaced, and an allowlist would just be a list of
 * things to get wrong. Pruning happens at the end of the migration, when the
 * bridge is deleted outright and the remaining genuine entry points become
 * explicit event listeners.
 *
 * @param {...object} namespaces `import * as ns` module namespace objects.
 */
export function exposeGlobals(...namespaces) {
  for (const ns of namespaces) {
    Object.assign(window, ns)
  }
}
