import { workspaceBundle } from './vite.shared.js'

// Replaces the standalone lib/bootstrap/bootstrap.min.js <script> tag on both
// workspace.html and login.html -- see src/bootstrap-framework-global.js.
export default workspaceBundle({
  entry: 'src/bootstrap-framework-global.js',
  fileName: 'omnidb.bootstrap.js',
  name: 'OmniDBBootstrap',
})
