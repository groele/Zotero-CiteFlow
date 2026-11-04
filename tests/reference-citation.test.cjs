const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MULTI_WINDOW_TRASH_GUARD = `  let selectedItems = requestedItems;
  if (!selectedItems) {
    const activeWin = Zotero.getMainWindow?.() || globalThis.window || Zotero.getMainWindows?.()?.[0];
    const tabs = activeWin?.Zotero_Tabs || globalThis.Zotero_Tabs;
    const pane = activeWin?.ZoteroPane || globalThis.ZoteroPane;
    if (!tabs || !pane) return;
    if (tabs.selectedIndex === 0) {
      selectedItems = pane.getSelectedItems();
    } else {
      const reader = Zotero.Reader.getByTabID(tabs.selectedID);
      const attachment = reader && Zotero.Items.get(reader.itemID);
      selectedItems = attachment?.parentItem ? [attachment.parentItem] : [];
    }
  }
  if (!Array.isArray(selectedItems) || !selectedItems.length
    || !selectedItems.every((item) => item && item.deleted !== true && item.inTrash !== true
      && item.isRegularItem?.() && item.isTopLevelItem())) return;`;

const REFERENCE_SELECTION_BLOCK = `  let selectedItems = requestedItems;
  if (!selectedItems) {
    if (Zotero_Tabs.selectedIndex === 0) {
      selectedItems = ZoteroPane.getSelectedItems();
    } else {
      const reader = Zotero.Reader.getByTabID(Zotero_Tabs.selectedID);
      const attachment = reader && Zotero.Items.get(reader.itemID);
      selectedItems = attachment?.parentItem ? [attachment.parentItem] : [];
    }
  }
  if (!Array.isArray(selectedItems) || !selectedItems.length
    || !selectedItems.every((item) => item?.isRegularItem?.() && item.isTopLevelItem())) return;`;

test('citation insertion preserves the validated native Word field behavior apart from the null-name adapter', () => {
  let current = fs.readFileSync(path.join(__dirname, '../src/modules/cite.mjs'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(current.includes(MULTI_WINDOW_TRASH_GUARD), 'cite.mjs must include multi-window and trash/deleted item guards');
  current = current.replace(MULTI_WINDOW_TRASH_GUARD, REFERENCE_SELECTION_BLOCK);
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
