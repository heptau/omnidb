import { workspaceBundle } from './vite.shared.js'

// Replaces the standalone lib/moment/moment.min.js <script> tag. Its own tiny
// bundle, not folded into early.js or main.js, because daterangepicker.js's
// <script> tag sits between this one and main.js's and needs window.moment to
// already exist -- see src/moment-global.js.
export default workspaceBundle({
  entry: 'src/moment-global.js',
  fileName: 'omnidb.moment.js',
  name: 'OmniDBMoment',
})
