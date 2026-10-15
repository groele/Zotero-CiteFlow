const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../chrome/content/scripts/index.js'), 'utf8');
const prefix = 'extensions.zotero.zoterocitation.';
function extractClass(context, name, endMarker) {
  const start = source.indexOf(`  var ${name} = class {`);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end + 5) + `;globalThis.TestClass = ${name};`, context);
  return context.TestClass;
}

test('quick citation preference gates the actual keyboard handler, including editor and modifier guards', async () => {
  const prefs = new Map([[prefix + 'quickCite.enable', false]]);
  const handlers = new Map(); let calls = 0;
  const win = { ZoteroPane: { getSelectedItems: () => [{ id: 7, isRegularItem: () => true, isTopLevelItem: () => true }] },
    document: { addEventListener(type, fn) { handlers.set(type, fn); }, removeEventListener(type) { handlers.delete(type); } } };
  const context = vm.createContext({
    console, addon: { data: { alive: true, citation: {} }, api: {} },
    config: { addonInstance: 'ZoteroCitation' }, runtime: { unregisterAll() {} },
    views_default: class { async patchIcon() {} async dragCite() {} dispose() {} },
    citeItems: async () => { calls++; }, Zotero: { Prefs: { get: key => prefs.get(key) }, logError() {} }
  });
  const start = source.indexOf('  // src/hooks.mjs'); const end = source.indexOf('  // src/runtime.mjs', start);
  vm.runInContext(source.slice(start, end) + ';globalThis.testHooks = hooks_default;', context);
  await context.testHooks.onMainWindowLoad(win);
  const fire = extra => {
    let prevented = false;
    handlers.get('keydown')({ key: "'", target: {}, preventDefault() { prevented = true; }, stopPropagation() {}, ...extra });
    return prevented;
  };
  assert.equal(fire({}), false); assert.equal(calls, 0);
  prefs.set(prefix + 'quickCite.enable', true);
  assert.equal(fire({}), true); assert.equal(calls, 1);
  for (const event of [{ target: { value: 'editing' } }, { target: { value: 'editing' }, originalTarget: {} },
    { target: {}, composedPath: () => [{ value: 'editing' }] }, { target: { isContentEditable: true } },
    { ctrlKey: true }, { altKey: true }, { shiftKey: true }, { metaKey: true }, { repeat: true }, { isComposing: true }, { key: 'a' }]) {
    assert.equal(fire(event), false);
  }
  assert.equal(calls, 1);
  prefs.set(prefix + 'quickCite.enable', false); assert.equal(fire({}), false);
  await context.testHooks.onMainWindowUnload(win); assert.equal(handlers.size, 0);
});

test('drag citation applies live independently of column visibility, without duplicate wrappers', async () => {
  const { NativeRuntime } = await import('../src/runtime.mjs'); const runtime = new NativeRuntime();
  const prefs = new Map([[prefix + 'dragCite.enable', false]]); const handlers = new Map(); let nativeStarts = 0, cites = 0;
  const column = { dataKey: 'citation', hidden: false };
  const items = [{ id: 7, isRegularItem: () => true, isTopLevelItem: () => true }];
  const win = { screenX: 0, screenY: 0, outerWidth: 800, outerHeight: 600,
    ZoteroPane: { getSelectedItems: () => items, itemsView: { onDragStart() { nativeStarts++; }, getColumns: () => [column] } },
    document: { addEventListener(type, fn) { handlers.set(type, fn); }, removeEventListener(type) { handlers.delete(type); } } };
  const original = win.ZoteroPane.itemsView.onDragStart;
  const context = vm.createContext({ runtime, config: { addonID: 'citeflow@groele', addonRef: 'zoterocitation' },
    addon: { data: { alive: true }, api: { citeItems: async () => { cites++; } } },
    Zotero: { Prefs: { get: key => prefs.get(key) }, logError() {}, ItemTreeManager: {} } });
  const Views = extractClass(context, 'Views', '\n  };\n  var views_default'); const view = new Views(win);
  await view.dragCite(); assert.equal(handlers.size, 0);
  prefs.set(prefix + 'dragCite.enable', true); await view.dragCite(); await view.dragCite();
  assert.equal(runtime.pendingPatchCount, 1); assert.equal(handlers.size, 1);
  const startDrag = (row = 0) => { const data = []; win.ZoteroPane.itemsView.onDragStart({ dataTransfer: { setData: (...args) => data.push(args) } }, row); return data; };
  const drop = extra => handlers.get('dragend')({ screenX: 900, screenY: 700, dataTransfer: { dropEffect: 'copy' }, ...extra });
  assert.equal(startDrag()[0][1], ''); drop({}); assert.equal(cites, 1);
  startDrag(); prefs.set(prefix + 'dragCite.enable', false); drop({}); assert.equal(cites, 1);
  startDrag(); assert.equal(nativeStarts, 1);
  prefs.set(prefix + 'dragCite.enable', true); column.hidden = true; startDrag(); assert.equal(nativeStarts, 1);
  win.ZoteroPane.itemsView.getColumns = () => [];
  startDrag(); drop({}); assert.equal(cites, 2, 'drag works without a registered or visible citation column');
  cites = 1;
  column.hidden = false; startDrag(); drop({ dataTransfer: { dropEffect: 'none', mozUserCancelled: false } });
  assert.equal(cites, 2, 'Word reports none after rejecting the empty transfer but still requires a native citation');
  startDrag(); drop({ dataTransfer: { dropEffect: 'none', mozUserCancelled: true } }); assert.equal(cites, 2);
  startDrag(); drop({ screenX: 100, screenY: 100 }); assert.equal(cites, 2);
  const secondItem = { id: 8, isRegularItem: () => true, isTopLevelItem: () => true };
  let selectedRow = 0; let citedItemID;
  win.ZoteroPane.itemsView.selection = {
    isSelected: row => row === selectedRow,
    select: row => { selectedRow = row; }
  };
  win.ZoteroPane.getSelectedItems = () => [[items[0], secondItem][selectedRow]];
  context.addon.api.citeItems = async selected => { citedItemID = selected[0].id; };
  startDrag(1); drop({});
  assert.equal(selectedRow, 1, 'dragging an unselected row updates Zotero selection');
  assert.equal(citedItemID, 8, 'the inserted citation matches the row under the pointer');
  await view.dispose(); assert.equal(handlers.size, 0); assert.equal(runtime.pendingPatchCount, 0);
  assert.equal(win.ZoteroPane.itemsView.onDragStart, original);
});

test('window preparation waits for collection context and safely refreshes an empty library', async () => {
  const { NativeRuntime } = await import('../src/runtime.mjs'); const runtime = new NativeRuntime();
  const events = []; let waits = 0;
  const tree = { collectionTreeRows: [], waitForLoad: async () => events.push('mount'),
    _ensureSortContextReady: async () => events.push('sort-ready'), _refreshPromise: Promise.resolve(),
    forceUpdate(callback) { events.push('render'); callback(); },
    _resetColumns() { throw Error('host reset cannot use a missing tree'); } };
  const context = vm.createContext({ runtime, config: { addonRef: 'zoterocitation' }, addon: { data: { alive: true } },
    Zotero: { Promise: { delay: async () => { waits++; tree.collectionTreeRows.push({}); } } } });
  const Views = extractClass(context, 'Views', '\n  };\n  var views_default');
  const view = new Views({ ZoteroPane: { itemsView: tree } });
  await view.prepareWindow(); assert.equal(waits, 1);
  await tree._resetColumns(); assert.deepEqual(events, ['mount', 'sort-ready', 'render']);
  let resets=0; tree.forceUpdate = callback => { tree.tree = { _resetColumns: async () => { resets++; } }; callback(); };
  await tree._resetColumns(); assert.equal(resets, 1, 'a table appearing during render is refreshed');
  await view.dispose(); assert.equal(runtime.pendingPatchCount, 0);
});

test('all four numeric settings change actual scheduling, health windows, and slow-operation classification', async () => {
  const prefs = new Map(); const timers = new Map(); let serial = 0, refreshed = 0;
  const pane = { itemsView: { refreshAndMaintainSelection: async () => { refreshed++; } } };
  const context = vm.createContext({ addon: { data: {} }, ZoteroPane: pane,
    setTimeout: (callback, delay) => { const id = ++serial; timers.set(id, { callback, delay }); return id; }, clearTimeout: id => timers.delete(id),
    Zotero: { Prefs: { get: key => prefs.get(key) }, getMainWindows: () => [{ ZoteroPane: pane }], logError() {} }, runtime: { log() {} }
  });
  const Citation = extractClass(context, 'Citation', '\n  };\n\n  // src/modules/cite.mjs');
  const c = Object.create(Citation.prototype);
  Object.assign(c, { _listenerStopped: false, _sessionCitedIDs: {}, _tagSyncTimerBySession: {}, _lastTagSyncSig: {},
    _pendingTagSyncIDsBySession: {}, _tagSyncInFlightBySession: {}, _debugCounters: {},
    _perfStats: { operation: { count: 0, totalMs: 0, lastMs: 0, maxMs: 0, slowCount: 0 } } });
  prefs.set(prefix + 'citationTagDebounceMs', 321); prefs.set(prefix + 'itemsViewRefreshDebounceMs', 456);
  prefs.set(prefix + 'healthWindowMs', 10000); prefs.set(prefix + 'perfSlowThresholdMs', 15);
  await c.applyPreferences();
  c.scheduleCitationTagSync('S', [7]); assert.equal(timers.get(c._tagSyncTimerBySession.S).delay, 321);
  c.scheduleItemsViewRefresh(); const refreshTimer = timers.get(c._itemsViewRefreshTimer);
  assert.equal(refreshTimer.delay, 456); await refreshTimer.callback(); assert.equal(refreshed, 1);
  c._errors = [{ time: Date.now() - 30000 }, { time: Date.now() }]; assert.equal(c.getDebugStats().recent.errorCount, 1);
  c._recordPerf('operation', 20); assert.equal(c._perfStats.operation.slowCount, 1);
  prefs.set(prefix + 'healthWindowMs', 60000); prefs.set(prefix + 'perfSlowThresholdMs', 30); await c.applyPreferences();
  assert.equal(c.getDebugStats().recent.errorCount, 2); c._recordPerf('operation', 20); assert.equal(c._perfStats.operation.slowCount, 1);
  for (const value of [undefined, null, true, false, '', ' ']) {
    prefs.set(prefix + 'itemsViewRefreshDebounceMs', value); await c.applyPreferences(); assert.equal(c._itemsViewRefreshDebounceMs, 120);
  }
});
