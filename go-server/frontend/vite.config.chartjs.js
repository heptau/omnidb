import { workspaceBundle } from './vite.shared.js'

// Replaces the standalone lib/chartjs/Chart.bundle.js and
// chartjs-plugin-annotation.min.js <script> tags. workspace.html only -- see
// src/chartjs-global.js.
export default workspaceBundle({
  entry: 'src/chartjs-global.js',
  fileName: 'omnidb.chartjs.js',
  name: 'OmniDBChartjs',
})
