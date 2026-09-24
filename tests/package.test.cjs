const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const runtimeFiles = [
  'bootstrap.js',
  'manifest.json',
  'prefs.js',
  'chrome/content/scripts/index.js',
  'chrome/content/icons/favicon.png',
  'chrome/content/icons/favicon@0.5x.png',
  'chrome/content/icons/word.png',
  'locale/en-US/zoterocitation-addon.ftl',
  'locale/zh-CN/zoterocitation-addon.ftl',
];

test('all runtime assets exist and are nonempty', () => {
  for (const file of runtimeFiles) {
    const stat = fs.statSync(path.join(root, file));
    assert.ok(stat.isFile() && stat.size > 0, file);
  }
  for (const icon of Object.values(manifest.icons)) {
    assert.ok(runtimeFiles.includes(icon), `unlisted manifest icon: ${icon}`);
  }
});

test('manifest and bundled addon identity agree', () => {
  assert.equal(manifest.applications.zotero.id, 'zoterocitation@polygon.org');
  assert.equal(manifest.applications.zotero.update_url, undefined, 'local candidate must not use the unrelated upstream update channel');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  const bundle = fs.readFileSync(path.join(root, 'chrome/content/scripts/index.js'), 'utf8');
  assert.match(bundle, /addonID: "zoterocitation@polygon\.org"/);
  assert.match(bundle, /addonRef: "zoterocitation"/);
});

test('both locale files define the citation column title', () => {
  for (const locale of ['en-US', 'zh-CN']) {
    const ftl = fs.readFileSync(path.join(root, `locale/${locale}/zoterocitation-addon.ftl`), 'utf8');
    assert.match(ftl, /^zoterocitation-column-citation\s*=/m, locale);
  }
});
