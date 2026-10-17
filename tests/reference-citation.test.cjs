const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

test('citation insertion preserves the validated native Word field behavior apart from the null-name adapter', () => {
  let current = fs.readFileSync(path.join(__dirname, '../src/modules/cite.mjs'), 'utf8').replace(/\r\n/g, '\n');
  const adapterStart = current.indexOf('  // Zotero 10\'s WinWord adapter');
  const adapterEnd = current.indexOf('  const patchedCite =', adapterStart);
  assert.ok(adapterStart > 0 && adapterEnd > adapterStart);
  current = current.slice(0, adapterStart) + current.slice(adapterEnd);
  current = current.replace('    if (wrappedGetApplication && integration.getApplication === wrappedGetApplication) {\n      integration.getApplication = getApplication;\n    }\n', '')
    .replace(/\nexport \{ citeItems \};\n?$/, '').trim();
  const expected = fs.readFileSync(path.join(__dirname, 'fixtures/citation-reference.sha256'), 'utf8').trim();
  assert.equal(crypto.createHash('sha256').update(current).digest('hex'), expected,
    'citation item selection, native field creation, merging, registration and rollback must retain reference behavior');
});
