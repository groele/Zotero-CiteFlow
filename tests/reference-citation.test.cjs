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

const TEMP_FIELD_GUARD = `      if (field.type == 2) {
        throw new host.Exception.Alert("integration.error.notInCitation");
      }
      if (field.type == 1) {
        citation = new host.Integration.Citation(field, await field.unserialize(), await field.getNoteIndex());
      } else {
        newField = true;
        field = new host.Integration.CitationField(field._field ?? field);
        citation = new host.Integration.Citation(field);
      }`;

const REFERENCE_FIELD_GUARD = `      if (field.type != 1) {
        throw new host.Exception.Alert("integration.error.notInCitation");
      }
      citation = new host.Integration.Citation(field, await field.unserialize(), await field.getNoteIndex());`;

const WORD_DROP_TARGET_GUARD = `      if (addon.data.verifyDroppedWordTarget?.() === false) {
        return;
      }
`;

test('citation insertion preserves the validated native Word field behavior apart from the null-name adapter', () => {
  let current = fs.readFileSync(path.join(__dirname, '../src/modules/cite.ts'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(current.includes(TEMP_FIELD_GUARD), 'cite.ts must reject only bibliography fields and treat TEMP fields as new citations');
  assert.ok(current.includes(WORD_DROP_TARGET_GUARD), 'cite.ts must verify recorded dropped Word window title before inserting');
  current = current.replace(TEMP_FIELD_GUARD, REFERENCE_FIELD_GUARD).replace(WORD_DROP_TARGET_GUARD, '');
  // Strip only the typed host boundary and annotations before comparing the native insertion body.
  current = current.slice(current.indexOf('// End typed boundary.') + '// End typed boundary.'.length).trimStart()
    .replace('var citeItems = async (requestedItems: CiteItem[] | null = null): Promise<void> => {', 'var citeItems = async (requestedItems = null) => {')
    .replace('  const isAlive = (): boolean => addon.data.alive !== false;\n', '')
    .replace('  const host = Zotero as unknown as CitationHost;\n  const globals = globalThis as unknown as CiteGlobals;\n', '')
    .replaceAll('host.', 'Zotero.').replaceAll('globals.', 'globalThis.')
    .replace('  let wrappedGetApplication: CitationHost["Integration"]["getApplication"];', '  let wrappedGetApplication;')
    .replace('function(this: unknown, ...args: unknown[])', 'function(...args)')
    .replace('async function(this: NativeSession, field: NativeField | null, addNote = false, addAnnotations = false): Promise<unknown>', 'async function(field, addNote = false, addAnnotations = false)')
    .replaceAll('Reflect.apply(cite, this, arguments)', 'cite.apply(this, arguments)')
    .replace('    let newField: boolean | undefined;', '    let newField;').replace('    let citation: NativeCitation;', '    let citation;')
    .replace('    let fieldIndexPromise: Promise<number>, citationsByItemIDPromise: Promise<Record<string, unknown>>;', '    let fieldIndexPromise, citationsByItemIDPromise;')
    .replace('(field as NativeField)._field', 'field._field').replace('var fields: NativeField[] | undefined =', 'var fields =')
    .replaceAll('(citation2.fieldIndex ?? citation2._fieldIndex)!', 'citation2.fieldIndex ?? citation2._fieldIndex')
    .replace('(citation2.field ?? citation2._field)!', 'citation2.field ?? citation2._field').replace('isAlive() && sessionID', 'addon.data.alive !== false && sessionID')
    .replace('    committed = true;\n\n    // Refresh', '    committed = true;\n    \n    // Refresh');
  assert.ok(current.includes(MULTI_WINDOW_TRASH_GUARD), 'cite.ts must include multi-window and trash/deleted item guards');
  current = current.replace(MULTI_WINDOW_TRASH_GUARD, REFERENCE_SELECTION_BLOCK);
  const adapterStart = current.indexOf('  // Zotero 10\'s WinWord adapter');
  const adapterEnd = current.indexOf('  const patchedCite =', adapterStart);
  assert.ok(adapterStart > 0 && adapterEnd > adapterStart);
  current = current.slice(0, adapterStart) + current.slice(adapterEnd);
  assert.ok(current.includes('    restorePatchedApplications();\n'), 'cite.ts must restore patched application instances in finally');
  current = current
    .replace('    restorePatchedApplications();\n', '')
    .replace('    if (wrappedGetApplication && integration.getApplication === wrappedGetApplication) {\n      integration.getApplication = getApplication;\n    }\n', '')
    .replace(/\nexport \{ citeItems \};\n?$/, '').trim();
  const expected = fs.readFileSync(path.join(__dirname, 'fixtures/citation-reference.sha256'), 'utf8').trim();
  assert.equal(crypto.createHash('sha256').update(current).digest('hex'), expected,
    'citation item selection, native field creation, merging, registration and rollback must retain reference behavior');
});
