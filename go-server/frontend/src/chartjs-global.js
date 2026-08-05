// @ts-check
/**
 * Replaces the `<script src=".../lib/chartjs/Chart.bundle.js">` tag with the
 * real npm package, published on `window` in the same spot.
 *
 * `chart.js@2` forced a hard dependency on moment.js just to exist (its
 * "time" scale required it unconditionally, even though nothing in this app
 * ever configures a time axis -- every chart's x-axis is a plain category
 * scale fed pre-formatted label strings from the Go side). `chart.js@4`
 * dropped that: time scales are opt-in via a separate date-adapter package
 * this app doesn't need at all, so moment is no longer pulled in by Chart.js.
 *
 * `chartjs-plugin-annotation` was also dropped entirely -- grepping every
 * chart config built anywhere in this codebase (Go and JS) for an
 * `annotation:` option turned up nothing: the plugin was wired up but never
 * actually configured by any chart.
 *
 * v4 requires explicitly registering whichever controllers/elements/scales/
 * plugins a chart actually uses (nothing auto-registers, unlike v2/the
 * `chart.js/auto` entry point) -- this app's chart type is always one of
 * exactly four fixed values (see inner_monitoring_dashboard_tab.js's
 * select_chart_type: "bar"/"pie"/"doughnut"/"line", the only options in that
 * dropdown; monitoring_units.go's built-in units are always "line"), so
 * registering precisely those keeps the bundle smaller than pulling in every
 * chart type Chart.js ships.
 */
import {
	ArcElement,
	BarController,
	BarElement,
	CategoryScale,
	Chart,
	DoughnutController,
	Legend,
	LinearScale,
	LineController,
	LineElement,
	PieController,
	PointElement,
	Title,
	Tooltip,
} from 'chart.js'

Chart.register(
	ArcElement,
	BarController,
	BarElement,
	CategoryScale,
	DoughnutController,
	Legend,
	LinearScale,
	LineController,
	LineElement,
	PieController,
	PointElement,
	Title,
	Tooltip,
)

window.Chart = Chart
