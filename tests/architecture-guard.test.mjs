import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
test('typed host entrypoints are built and checked before bundling', () => {
  const config = JSON.parse(read('tsconfig.json'));
  const pkg = JSON.parse(read('package.json'));
  assert.equal(config.extends, 'zotero-types/entries/sandbox/tsconfig.json');
  for (const key of ['strict', 'noEmit', 'isolatedModules', 'verbatimModuleSyntax']) assert.equal(config.compilerOptions[key], true);
  assert.match(pkg.scripts.build, /typecheck/);
  assert.match(read('scripts/build.ps1'), /npm run build/);
  const build = read('scripts/build-source.mjs');
  assert.match(build, /src\/index\.ts/);
  assert.match(build, /src\/preferences\.ts/);
  assert.doesNotMatch(build, /inlineDomainClasses|collectedBodies/);
  for (const source of ['src/index.ts', 'src/preferences.ts']) assert.ok(read(source).length > 0);
});

test('all editable runtime source modules are TypeScript', () => {
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const path = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir);
      if (entry.isDirectory()) walk(path);
      else assert.doesNotMatch(entry.name, /\.(?:mjs|cjs|js)$/, `runtime source must be TypeScript: ${path.pathname}`);
    }
  }
  walk(new URL('../src/', import.meta.url));
  const config = JSON.parse(read('tsconfig.json'));
  assert.notEqual(config.compilerOptions.checkJs, false);
  assert.notEqual(config.compilerOptions.allowJs, true);
});
