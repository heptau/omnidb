import { workspaceBundle } from './vite.shared.js'

// The main bundle: everything that used to load after the third-party
// libraries. Built second, so it must not clear dist/.
export default workspaceBundle({
  entry: 'src/main.js',
  fileName: 'omnidb.bundle.js',
  name: 'OmniDBWorkspaceBundle',
})
