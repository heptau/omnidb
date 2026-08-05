// Stands in for the real chart.js package via jsconfig.json's `paths` remap.
//
// A `declare module 'chart.js'` in globals.d.ts is not enough: TypeScript
// only falls back to an ambient module declaration when it cannot resolve the
// specifier to a real file, and chart.js resolves just fine to
// node_modules/chart.js/dist/Chart.js -- which this project's TypeScript
// cannot parse (a syntax error inside chart.js@2.9.4's own JSDoc, not
// anything under src/). Redirecting the specifier itself is the only way to
// keep tsc from ever opening that file. Vite's bundler resolution is
// unaffected by tsconfig `paths`, so the real package still ships at runtime.
declare const Chart: any;
export default Chart;
