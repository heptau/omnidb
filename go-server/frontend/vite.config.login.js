import { workspaceBundle } from './vite.shared.js'

// The login page's own bundle -- see src/login.js. Built after the early one,
// so it must not clear dist/.
export default workspaceBundle({
  entry: 'src/login.js',
  fileName: 'omnidb.login.js',
  name: 'OmniDBLogin',
})
