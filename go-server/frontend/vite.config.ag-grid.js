import { workspaceBundle } from './vite.shared.js'

// Replaces the standalone lib/ag-grid/ag-grid-community.min.js <script> tag.
// workspace.html only -- see src/ag-grid-global.js.
export default workspaceBundle({
  entry: 'src/ag-grid-global.js',
  fileName: 'omnidb.ag-grid.js',
  name: 'OmniDBAgGrid',
})
