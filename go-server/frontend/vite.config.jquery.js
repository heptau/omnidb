import { workspaceBundle } from './vite.shared.js'

// Replaces the standalone lib/jquery/jquery.min.js <script> tag on both
// workspace.html and login.html. Its own tiny bundle because it has to load
// before every other bundle on both pages -- see src/jquery-global.js.
export default workspaceBundle({
  entry: 'src/jquery-global.js',
  fileName: 'omnidb.jquery.js',
  name: 'OmniDBJQuery',
})
