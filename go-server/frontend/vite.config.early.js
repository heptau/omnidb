import { workspaceBundle } from './vite.shared.js'

// The handful of files that must run before jQuery-era setup and before the
// inline `startLoading()` call in workspace.html. Built first, so this is the
// one that clears dist/.
export default workspaceBundle({
  entry: 'src/early.js',
  fileName: 'omnidb.early.js',
  name: 'OmniDBWorkspaceEarly',
  emptyOutDir: true,
})
