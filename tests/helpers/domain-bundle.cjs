const esbuild = require('esbuild');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = esbuild.buildSync({
  stdin: { contents: `export { Citation } from './src/modules/citation.ts';
export { default as Views } from './src/modules/views.ts';
export { citeItems } from './src/modules/cite.ts';`, resolveDir: root },
  bundle: true, format: 'iife', globalName: '__citeflowDomains', write: false,
  target: 'firefox140'
}).outputFiles[0].text;
exports.loadDomains = context => {
  vm.runInContext(source, context);
  return context.__citeflowDomains;
};
