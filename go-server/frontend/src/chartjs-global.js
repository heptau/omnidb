// @ts-check
/**
 * Replaces the `<script src=".../lib/chartjs/Chart.bundle.js">` and
 * `.../chartjs-plugin-annotation.min.js` tags with the real npm packages,
 * published on `window` in the same spot.
 *
 * The vendored "Chart.bundle.js" hashed identical to chart.js@2.9.4's own
 * `dist/Chart.bundle.min.js` under a plain name (like bootstrap.min.js did);
 * chartjs-plugin-annotation@0.5.7 differed from the vendored copy only in
 * comment indentation and a trailing newline. Neither has a local patch.
 *
 * Importing the plain `chart.js` package instead of the bundle lets Chart.js's
 * own `require('moment')` resolve to the `moment` dependency this project
 * already has, rather than embedding a second copy of it. The annotation
 * plugin does its own `require('chart.js')` internally and mutates that same
 * module's `Chart.Annotation` namespace and plugin registry as a side effect
 * -- since both imports resolve to the identical module instance, that patches
 * the exact object this file publishes to `window.Chart`.
 */
import Chart from 'chart.js'
import 'chartjs-plugin-annotation'

window.Chart = Chart
