// @ts-check
/**
 * Replaces the `<script src=".../lib/ag-grid/ag-grid-community.min.js">` tag
 * with the real npm package, published on `window` in the same spot.
 *
 * Byte-identical to `ag-grid-community@28.0.2`'s own `dist/ag-grid-community.min.js`
 * (checked by hash), so this imports that exact file rather than the modular
 * ESM entry point: the modular API needs an explicit `ModuleRegistry.registerModules()`
 * call to enable each community feature, where this bundle auto-registers all
 * of them the same way the vendored <script> tag always did. AgGridAdapter.js
 * reads `agGrid.Grid` off the global, unchanged.
 */
import * as agGrid from 'ag-grid-community/dist/ag-grid-community.min.js'

window.agGrid = agGrid
