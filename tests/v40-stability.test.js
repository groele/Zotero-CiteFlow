const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourceDirectory = process.env.CITATION_SOURCE_DIR || ".";
const isV40Source = /V40/i.test(sourceDirectory);
const sourcePath = path.join(__dirname, "..", sourceDirectory, "chrome", "content", "scripts", "index.js");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", sourceDirectory, "manifest.json"), "utf8"));
const source = fs.readFileSync(sourcePath, "utf8").replace(/\r\n/g, "\n");
const start = source.indexOf("  var Citation = class {");
const endMarker = "\n  };\n\n  // src/modules/cite.ts";
const end = source.indexOf(endMarker, start);
assert.ok(start >= 0 && end > start, "Citation class must be extractable from the bundle");

const prefStore = new Map();
const sandbox = {
  console,
  addon: { data: {} },
  config: { addonID: "zoterocitation@polygon.org", addonRef: "zoterocitation" },
  getString: (key) => key,
  ztoolkit: { log() {} },
  window: {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    addEventListener() {},
    removeEventListener() {},
    close() {}
  },
  ZoteroPane: { itemsView: { refreshAndMaintainSelection() {} }, collectionsView: {} },
  Zotero: {
    Prefs: {
      get(key, global = false) {
        return prefStore.get(global ? key : `extensions.zotero.${key}`);
      },
      set(key, value, global = false) {
        prefStore.set(global ? key : `extensions.zotero.${key}`, value);
      }
    },
    Promise: { delay: async () => {} },
    Integration: { sessions: {} },
    Libraries: { userLibraryID: 1 },
    Items: { get: () => null },
    ItemTreeManager: { async registerColumns() {} }
  }
};
vm.createContext(sandbox);
vm.runInContext(`${source.slice(start, end + 5)}\nglobalThis.__Citation = Citation;`, sandbox);
const Citation = sandbox.__Citation;
const viewsStart = source.indexOf("  var Views = class {");
const viewsEnd = source.indexOf("\n  };\n  var views_default", viewsStart);
assert.ok(viewsStart >= 0 && viewsEnd > viewsStart, "Views class must be extractable from the bundle");
vm.runInContext(`${source.slice(viewsStart, viewsEnd + 5)}\nglobalThis.__Views = Views;`, sandbox);
const Views = sandbox.__Views;

function bareCitation() {
  const instance = Object.create(Citation.prototype);
  instance.sessions = {};
  instance._missingSessionCountBySession = {};
  instance._temporaryCollectionKeys = new Set();
  instance._execCommandWaitTimeoutMs = 500;
  instance._execCommandPollIntervalMs = 25;
  instance._listenerStopped = false;
  instance._lastRefreshAt = {};
  instance._minRefreshInterval = 0;
  instance._emptyReadCountBySession = {};
  instance._refreshRetryTimerBySession = {};
  instance._docIdBySession = {};
  instance.activeSessionID = null;
  instance._execCommandBindings = new Map();
  instance._execCommandSerial = 0;
  instance._execCommandDepth = 0;
  instance._collectionRenameRetryTimerBySession = {};
  instance._collectionRenameRetryCountBySession = {};
  instance._citationTagName = "/Citations";
  instance._managedCitationTagIDs = {};
  instance._lastTagSyncSig = {};
  instance._sessionCitedIDs = {};
  instance._pendingTagSyncIDsBySession = {};
  instance._tagSyncInFlightBySession = {};
  instance._tagSyncTimerBySession = {};
  instance._bumpDebugCounter = () => {};
  instance._recordHealthEvent = () => {};
  instance._saveManagedTagIDs = () => {};
  instance._sessionUpdateQueue = {};
  instance._sessionUpdateRevision = {};
  instance._sortedCacheBySession = {};
  instance._perfStats = {};
  instance.debugLog = () => {};
  instance.logError = () => {};
  instance._recordPerf = () => {};
  instance.scheduleItemsViewRefresh = () => {};
  return instance;
}

async function testPreferenceMigration() {
  prefStore.clear();
  prefStore.set("zotero-citation.temporaryCollectionKeys", JSON.stringify(["LEGACY"]));
  const instance = bareCitation();
  const migrated = instance._loadKeySet("zotero-citation.temporaryCollectionKeys");
  assert.deepEqual([...migrated], ["LEGACY"]);
  assert.equal(prefStore.get("extensions.zotero.zotero-citation.temporaryCollectionKeys"), '["LEGACY"]');
  assert.deepEqual([...instance._loadKeySet("zotero-citation.temporaryCollectionKeys")], ["LEGACY"]);
}

async function testMismatchPreservesLastGoodState() {
  const instance = bareCitation();
  const session = {
    citationsByItemID: { 1: [{ properties: { plainCitation: "A" } }] },
    citationsByIndex: {},
    styleClass: "in-text",
    async updateFromDocument() {}
  };
  instance.sessions.S = { idData: { 1: { plainCitation: "1: A" } } };
  let updateCalls = 0;
  let retryCalls = 0;
  instance.updateCitations = async () => { updateCalls += 1; };
  instance.scheduleCitationTagSync = () => {};
  instance._scheduleSessionRefresh = () => { retryCalls += 1; };
  await instance.refreshSessionCitations("S", session);
  assert.equal(updateCalls, 0, "a transient index mismatch must not clear data");
  assert.equal(retryCalls, 1, "a transient mismatch must schedule a retry");
  assert.equal(instance.sessions.S.idData[1].plainCitation, "1: A");
}

async function testEmptyNeedsConfirmation() {
  const instance = bareCitation();
  const session = { citationsByItemID: {}, citationsByIndex: {}, styleClass: "in-text" };
  instance.sessions.S = { idData: { 1: { plainCitation: "1: A" } } };
  const updates = [];
  instance.updateCitations = async (...args) => updates.push(args.slice(1, 3));
  instance.scheduleCitationTagSync = () => {};
  instance._scheduleSessionRefresh = () => {};
  await instance.refreshSessionCitations("S", session);
  assert.equal(updates.length, 0);
  await instance.refreshSessionCitations("S", session);
  assert.equal(updates.length, 1);
  assert.equal(Object.keys(updates[0][0]).length, 0);
  assert.equal(updates[0][1].length, 0);
}

async function testLatestRevisionWins() {
  const instance = bareCitation();
  instance.sessions.S = { idData: {} };
  const applied = [];
  instance._applyCitations = async (_sid, data) => applied.push(Object.keys(data)[0]);
  const first = instance.updateCitations("S", { 1: [] }, [1], "in-text");
  const second = instance.updateCitations("S", { 2: [] }, [2], "in-text");
  await Promise.all([first, second]);
  assert.deepEqual(applied, ["2"], "queued updates must discard a superseded snapshot");
}

async function testOrphanNeverUsesZero() {
  const instance = bareCitation();
  instance.sessions.S = { idData: {}, collection: { id: 1 } };
  instance._sessionUpdateRevision.S = 1;
  instance.syncCollectionItems = async () => {};
  sandbox.Zotero.Integration.sessions.S = {};
  sandbox.Zotero.Items.get = () => ({ libraryID: 1, isTopLevelItem: () => true });
  await instance._applyCitations("S", { 9: [{ properties: { plainCitation: "A" } }] }, [], "in-text", 1);
  assert.equal(instance.sessions.S.idData[9].plainCitation, "—: (pending)");
  assert.ok(!instance.sessions.S.idData[9].plainCitation.startsWith("0"));
}

async function testDocumentNames() {
  const instance = bareCitation();
  assert.equal(instance._getDocumentDisplayName("C:\\Work\\论文.docx"), "论文.docx");
  if (isV40Source) {
    assert.equal(instance._getDocumentDisplayName("C:\\Work\\report#part?.docx"), "report#part?.docx");
    assert.equal(instance._getDocumentDisplayName("\\\\server\\share\\report#part?.docx"), "report#part?.docx");
  }
  assert.equal(instance._getDocumentDisplayName("https://example.test/a/%E6%B5%8B%E8%AF%95.docx?x=1"), "测试.docx");
  assert.equal(instance._getDocumentDisplayName("/Applications/Microsoft Word.app/"), "");
}

async function testGroupAndReadOnlyTagWritesAreSkipped() {
  const instance = bareCitation();
  let groupWrites = 0;
  let readOnlyWrites = 0;
  let userWrites = 0;
  const items = {
    1: { libraryID: 2, addTag() { groupWrites += 1; }, saveTx: async () => { groupWrites += 1; } },
    2: { libraryID: 1, editable: false, addTag() { readOnlyWrites += 1; }, saveTx: async () => { readOnlyWrites += 1; } },
    3: { libraryID: 1, addTag() {}, saveTx: async () => { userWrites += 1; } }
  };
  sandbox.Zotero.Libraries = { userLibraryID: 1, get: () => ({ editable: true }) };
  sandbox.Zotero.Items.get = (id) => items[id] || null;
  instance._sessionCitedIDs = { S: [1, 2, 3] };
  await instance.syncCitationTags("S", [1, 2, 3]);
  assert.equal(groupWrites, 0);
  assert.equal(readOnlyWrites, 0);
  assert.equal(userWrites, 1);
}

async function testTagSaveFailureRollsBackInMemoryMutation() {
  const instance = bareCitation();
  const tags = new Set();
  const added = {
    libraryID: 1,
    hasTag: (tag) => tags.has(tag),
    addTag: (tag) => tags.add(tag),
    removeTag: (tag) => tags.delete(tag),
    saveTx: async () => { throw new Error("write locked"); }
  };
  const removedTags = new Set([instance._citationTagName]);
  const removed = {
    libraryID: 1,
    hasTag: (tag) => removedTags.has(tag),
    addTag: (tag) => removedTags.add(tag),
    removeTag: (tag) => removedTags.delete(tag),
    saveTx: async () => { throw new Error("write locked"); }
  };
  sandbox.Zotero.Libraries = { userLibraryID: 1, get: () => ({ editable: true }) };
  sandbox.Zotero.Items.get = (id) => id === 4 ? added : (id === 5 ? removed : null);
  instance._sessionCitedIDs = { S: [4] };
  instance._managedCitationTagIDs = { 5: true };
  await instance.syncCitationTags("S", [4]);
  assert.equal(tags.has(instance._citationTagName), false, "failed tag add must roll back in memory");
  instance._sessionCitedIDs = { S: [4] };
  await instance.syncCitationTags("S", []);
  assert.equal(removedTags.has(instance._citationTagName), true, "failed tag removal must roll back in memory");
}

async function testZotero10CollectionSelectionAPI() {
  let options;
  sandbox.Zotero.ItemTreeManager.registerColumns = async (value) => { options = value; };
  sandbox.Zotero.ZoteroCitation = {
    api: {
      sessions: {
        S: { collection: { key: "WORD", libraryID: 1 }, idData: { 1: { plainCitation: "1: A" } } },
        OTHER: { collection: { key: "WORD", libraryID: 2 }, idData: { 1: { plainCitation: "2: Other" } } }
      }
    }
  };
  sandbox.Zotero.Integration.currentSession = { sessionID: "OTHER" };
  sandbox.Zotero.ZoteroCitation.api.activeSessionID = "OTHER";
  sandbox.ZoteroPane.getSelectedCollections = () => [{ key: "WORD", libraryID: 1 }];
  sandbox.ZoteroPane.collectionsView.getSelectedCollections = () => { throw new Error("legacy fallback should not run"); };
  await Object.create(Views.prototype).createCitationColumn();
  assert.equal(options.pluginID, "zoterocitation@polygon.org");
  assert.equal(options.dataProvider({ id: 1 }, "citation"), "1: A");
  if (!isV40Source) {
    return;
  }
  sandbox.ZoteroPane.getSelectedCollections = () => [];
  assert.equal(options.dataProvider({ id: 1 }, "citation"), "2: Other", "explicit activeSessionID must win over currentSession");
  sandbox.Zotero.ZoteroCitation.api.sessions.OTHER.idData = { 1: { plainCitation: "2: Other" } };
  sandbox.ZoteroPane.getSelectedCollections = () => [{ key: "WORD", libraryID: 1 }, { key: "WORD", libraryID: 2 }];
  assert.equal(options.dataProvider({ id: 1 }, "citation"), "", "ambiguous multi-document selection must not choose randomly");
}

async function hookFixture(nativeCommand, useGetSession = true) {
  const instance = bareCitation();
  instance.clearStaleArtifacts = async () => {};
  const collection = key => ({ id: key === "A" ? 1 : 2, key, name: key, saveTx: async () => {}, eraseTx: async () => {} });
  instance.sessions = { A: { collection: collection("A"), idData: {} }, B: { collection: collection("B"), idData: {} } };
  sandbox.Zotero.ZoteroCitation = { api: {} };
  sandbox.Zotero.Integration.sessions = { A: { sessionID: "A" }, B: { sessionID: "B" } };
  sandbox.Zotero.Integration.currentSession = sandbox.Zotero.Integration.sessions.A;
  sandbox.Zotero.Integration.getSession = useGetSession ? async (_app, doc) => [sandbox.Zotero.Integration.sessions[doc.id], false] : undefined;
  sandbox.Zotero.Integration.execCommand = nativeCommand || (async (agent, command, docId) => {
    const result = await sandbox.Zotero.Integration.getSession(null, { id: docId.startsWith("A") ? "A" : "B" }, agent, command);
    sandbox.Zotero.Integration.currentSession = result[0];
    return "native-ok";
  });
  await instance.listener(1000000);
  clearTimeout(instance._listenerTimer); instance._listenerTimer = null;
  return instance;
}

async function testActualSessionAndSameSessionRename() {
  const instance = await hookFixture();
  try {
    assert.equal(await sandbox.Zotero.Integration.execCommand("WinWord", "refresh", "B.docx"), "native-ok");
    assert.equal(instance.sessions.A.collection.name, "A");
    assert.equal(instance.sessions.B.collection.name, "B.docx");
    assert.equal(instance.activeSessionID, "B");
    await sandbox.Zotero.Integration.execCommand("WinWord", "refresh", "B-renamed.docx");
    assert.equal(instance.sessions.B.collection.name, "B-renamed.docx");
    await sandbox.Zotero.Integration.execCommand("WinWord", "refresh", "A.docx");
    assert.equal(instance.activeSessionID, "A");
  } finally { await instance.clear(); }
}

async function testCancelledAndRejectedCommand() {
  for (const rejects of [false, true]) {
    const instance = await hookFixture(async () => { if (rejects) throw new Error("native-failure"); });
    try {
      const call = sandbox.Zotero.Integration.execCommand("WinWord", "refresh", "B.docx");
      if (rejects) await assert.rejects(call, /native-failure/); else await call;
      assert.equal(instance.sessions.A.collection.name, "A");
      assert.equal(instance.sessions.B.collection.name, "B");
      assert.equal(instance.activeSessionID, null);
      assert.equal(instance._execCommandBindings.size, 0);
      assert.equal(instance._execCommandDepth, 0);
    } finally { await instance.clear(); }
  }
}

async function testNativeArgumentsAndWrapperChain() {
  const receiver = { marker: 1 };
  let observed;
  const instance = await hookFixture(function(...args) { observed = { self: this, args }; return 123; });
  const execWrapper = sandbox.Zotero.Integration.execCommand;
  const sessionWrapper = sandbox.Zotero.Integration.getSession;
  const outer = function(...args) { return execWrapper.apply(this, args); };
  sandbox.Zotero.Integration.execCommand = outer;
  sandbox.Zotero.Integration.getSession = function(...args) { return sessionWrapper.apply(this, args); };
  await instance.clear();
  assert.equal(sandbox.Zotero.Integration.execCommand, outer);
  for (let i = 0; i < 3; i++) {
    assert.equal(await outer.call(receiver, "WinWord", "refresh", "B.docx", 1, "extra"), 123);
    assert.equal(observed.self, receiver);
    assert.deepEqual(observed.args, ["WinWord", "refresh", "B.docx", 1, "extra"]);
  }
  assert.equal((await sandbox.Zotero.Integration.getSession(null, {id: "B"}, "WinWord", "refresh"))[0].sessionID, "B");
  await instance.clear();
}

async function testOverlapDoesNotGuess() {
  const resolvers = [];
  const instance = await hookFixture(async () => new Promise(resolve => resolvers.push(resolve)));
  try {
    const a = sandbox.Zotero.Integration.execCommand("WinWord", "refresh", "A.docx");
    const b = sandbox.Zotero.Integration.execCommand("WinWord", "refresh", "B.docx");
    resolvers[1]("B-result"); resolvers[0]("A-result");
    assert.deepEqual(await Promise.all([a, b]), ["A-result", "B-result"]);
    assert.equal(instance.sessions.A.collection.name, "A");
    assert.equal(instance.sessions.B.collection.name, "B");
    assert.equal(instance._execCommandBindings.size, 0);
  } finally { await instance.clear(); }
}

async function testDisableDuringCommand() {
  let complete;
  const instance = await hookFixture(() => new Promise(resolve => { complete = resolve; }));
  const command = sandbox.Zotero.Integration.execCommand("WinWord", "refresh", "B.docx");
  await instance.clear();
  complete("finished");
  assert.equal(await command, "finished");
  assert.equal(Object.keys(instance.sessions).length, 0);
  assert.equal(instance.activeSessionID, null);
}

async function testNoCrossDocumentFallback() {
  let column;
  sandbox.Zotero.ItemTreeManager.registerColumns = async value => { column = value; };
  sandbox.Zotero.ZoteroCitation = { api: { activeSessionID: "A", sessions: {
    A: {idData: {}}, B: {idData: {7: {plainCitation: "9: B"}}}
  } } };
  sandbox.Zotero.Integration.currentSession = {sessionID: "A"};
  sandbox.ZoteroPane.getSelectedCollections = () => [];
  await Object.create(Views.prototype).createCitationColumn();
  assert.equal(column.dataProvider({id: 7}, "citation"), "");
  sandbox.Zotero.ZoteroCitation.api.activeSessionID = null;
  sandbox.Zotero.Integration.currentSession = null;
  assert.equal(column.dataProvider({id: 7}, "citation"), "9: B");
}

async function testMalformedSnapshotsAndCacheIsolation() {
  const instance = bareCitation();
  instance.getSortedItemIDs({0: {citationItems: [{id: 1}]}}, "S");
  const data = {0: null, 1: {citationItems: [null, {}, {id: false}, {id: -1}, {id: 2}]}, 2: {citationItems: "bad"}};
  const result = instance.getSortedItemIDs(data, "S");
  assert.deepEqual([...result], [2]);
  result.push(999);
  assert.deepEqual([...instance.getSortedItemIDs(data, "S")], [2]);
  assert.deepEqual([...instance.getSortedItemIDs({0: {citationItems: [{id: "3"}, {id: 3}, {id: 4}]}}, "T")], [3, 4]);
}

function regularItem(id) { return {id, isRegularItem: () => true, isTopLevelItem: () => true}; }
async function testDragLifecycle() {
  const handlers = new Map(); let startDrag; const calls = [];
  sandbox.document = { addEventListener: (type, fn) => handlers.set(type, fn), removeEventListener: (type, fn) => {
    if (handlers.get(type) === fn) handlers.delete(type);
  }, documentElement: { getBoundingClientRect: () => ({width: 800, height: 600}) } };
  Object.assign(sandbox.window, {screenX: 0, screenY: 0, outerWidth: 800, outerHeight: 600});
  sandbox.addon.data.alive = true;
  sandbox.addon.api = {citeItems: async items => calls.push(Array.from(items, i => i.id))};
  sandbox.ztoolkit.patch = (_owner, _key, _id, patch) => { startDrag = patch(() => "native-drag"); };
  let selected = [regularItem(1)];
  sandbox.ZoteroPane.getSelectedItems = () => selected;
  const view = Object.create(Views.prototype);
  view.getColumnInfo = () => ({hidden: false});
  await view.dragCite();
  const transfer = {setData() {}, dropEffect: "copy", mozUserCancelled: false};
  const start = () => startDrag({dataTransfer: transfer}, 0);
  const end = extra => handlers.get("dragend")({screenX: 900, screenY: 900, dataTransfer: transfer, ...extra});
  sandbox.Zotero.Prefs.set("extensions.zotero.zoterocitation.dragCite.enable", false, true);
  assert.equal(start(), "native-drag"); end(); assert.equal(calls.length, 0);
  sandbox.Zotero.Prefs.set("extensions.zotero.zoterocitation.dragCite.enable", true, true);
  start(); transfer.mozUserCancelled = true; end(); assert.equal(calls.length, 0);
  transfer.mozUserCancelled = false; start(); transfer.dropEffect = "none"; end(); assert.equal(calls.length, 0);
  transfer.dropEffect = "copy"; start(); end({screenX: 10, screenY: 10}); assert.equal(calls.length, 0);
  start(); selected = [regularItem(2)]; end(); assert.deepEqual(calls, [[1]], "must cite drag-start selection");
  end(); assert.equal(calls.length, 1, "duplicate dragend must not cite again");
  start(); view.dispose(); assert.equal(handlers.size, 0);
  assert.equal(start(), "native-drag", "retained patch is transparent after disposal");
}

async function testCrossSessionTagSerialization() {
  const instance = bareCitation(); let inFlight = 0, maximum = 0;
  instance._syncCitationTags = async () => {
    maximum = Math.max(maximum, ++inFlight);
    await new Promise(resolve => setTimeout(resolve, 1)); inFlight--;
  };
  await Promise.all(Array.from({length: 30}, (_, i) => instance.syncCitationTags(`S${i}`, [i + 1])));
  assert.equal(maximum, 1);
  assert.equal(instance._tagSyncQueue, null);
}

async function testLargeSnapshotOrder() {
  const instance = bareCitation(); const snapshot = {};
  for (let i = 999; i >= 0; i--) snapshot[i] = {citationItems: [{id: i + 1}, {id: 1}]};
  const result = instance.getSortedItemIDs(snapshot, "large");
  assert.equal(result.length, 1000);
  assert.deepEqual([...result], Array.from({length: 1000}, (_, i) => i + 1));
  snapshot[500].citationItems = [{id: 1001}];
  assert.ok(instance.getSortedItemIDs(snapshot, "large").includes(1001));
}

const tests = [testPreferenceMigration, testMismatchPreservesLastGoodState, testEmptyNeedsConfirmation,
  testLatestRevisionWins, testOrphanNeverUsesZero, testDocumentNames,
  testGroupAndReadOnlyTagWritesAreSkipped, testTagSaveFailureRollsBackInMemoryMutation,
  testZotero10CollectionSelectionAPI, testActualSessionAndSameSessionRename, testCancelledAndRejectedCommand,
  testNativeArgumentsAndWrapperChain, testOverlapDoesNotGuess, testDisableDuringCommand,
  testNoCrossDocumentFallback, testMalformedSnapshotsAndCacheIsolation, testDragLifecycle,
  testCrossSessionTagSerialization, testLargeSnapshotOrder];
async function testStartupCancellation() {
  const instance = bareCitation(); let release;
  const native = () => "native";
  sandbox.Zotero.Integration.execCommand = native;
  instance.clearStaleArtifacts = () => new Promise(resolve => { release = resolve; });
  const startup = instance.listener(1000000);
  await instance.clear(); release(); await startup;
  assert.equal(sandbox.Zotero.Integration.execCommand, native);
  assert.equal(instance._listenerStopped, true);
  assert.ok(!instance._listenerTimer);
}
async function testRenameRollbackAndObsoleteRename() {
  const instance = bareCitation();
  const collection = {name: "original", saveTx: async () => { throw new Error("locked"); }};
  instance.sessions.S = {collection}; instance._docIdBySession.S = "current.docx";
  await assert.rejects(instance._renameCollection("S", "new", "current.docx"), /locked/);
  assert.equal(collection.name, "original");
  await instance._renameCollection("S", "obsolete", "old.docx");
  assert.equal(collection.name, "original");
  collection.saveTx = async () => {};
  await instance._renameCollection("S", "new", "current.docx");
  assert.equal(collection.name, "new");
}
async function testCiteSelectionAndNativeFailureRecovery() {
  const a = source.indexOf("  var citeItemsInFlight = false;");
  const b = source.indexOf("  // src/modules/views.ts", a);
  vm.runInContext(source.slice(a, b), sandbox);
  sandbox.Zotero_Tabs = {selectedIndex: 0};
  sandbox.addon.data.alive = true;
  sandbox.Zotero.Integration.Session = function() {};
  const nativeCite = () => "native-cite";
  sandbox.Zotero.Integration.Session.prototype.cite = nativeCite;
  let calls = 0, args;
  sandbox.Zotero.Integration.execCommand = async (...values) => { calls++; args = values; throw new Error("native-fail"); };
  sandbox.ZoteroPane.getSelectedItems = () => [];
  await sandbox.citeItems(); assert.equal(calls, 0);
  sandbox.ZoteroPane.getSelectedItems = () => [{id: 1, isRegularItem: () => false}];
  await sandbox.citeItems(); assert.equal(calls, 0);
  sandbox.ZoteroPane.getSelectedItems = () => [regularItem(1)];
  await assert.rejects(sandbox.citeItems(), /native-fail/);
  assert.equal(sandbox.Zotero.Integration.Session.prototype.cite, nativeCite);
  assert.equal(args[2], null, "must ask Word for its active document");
  await assert.rejects(sandbox.citeItems(), /native-fail/);
  assert.equal(calls, 2, "failed command must release insertion lock");
  sandbox.Zotero_Tabs.selectedIndex = 1;
  sandbox.Zotero_Tabs.selectedID = "standalone";
  sandbox.Zotero.Reader = {getByTabID: () => null};
  await sandbox.citeItems(); assert.equal(calls, 2);
}
async function testInsertRollbackAndCapturedSelection() {
  sandbox.Zotero_Tabs = {selectedIndex: 0};
  sandbox.addon.data.alive = true;
  sandbox.Zotero.Promise.resolve = value => Promise.resolve(value);
  sandbox.Zotero.logError = () => {};
  let deleted = 0, failPrepare = true, insertedIDs;
  sandbox.Zotero.Integration.CitationField = class {
    async delete() { deleted++; }
    async getNoteIndex() { return 0; }
  };
  sandbox.Zotero.Integration.Citation = class {
    constructor(field) { this._field = field; this.citationItems = []; }
    async prepareForEditing() { if (failPrepare) throw new Error("prepare failed"); }
  };
  sandbox.Zotero.Integration.CitationEditInterface = class { constructor(citation) { this.citation = citation; } };
  const session = {
    sessionID: "S", style: {opt: {}}, data: {prefs: {delayCitationUpdates: true}},
    citationsByItemID: {}, addField: async () => ({}), addCitation: async () => {},
    getFields: async () => [], updateFromDocument: async () => {},
    _insertCitingResult: async (_index, _field, citation) => {
      insertedIDs = Array.from(citation.citationItems, item => item.id); return [citation];
    }
  };
  sandbox.Zotero.Integration.execCommand = async () => {
    sandbox.ZoteroPane.getSelectedItems = () => [regularItem(99)];
    return sandbox.Zotero.Integration.Session.prototype.cite.call(session);
  };
  sandbox.ZoteroPane.getSelectedItems = () => [regularItem(1)];
  await assert.rejects(sandbox.citeItems(), /prepare failed/);
  assert.equal(deleted, 1, "uncommitted new field must be removed on preparation failure");
  failPrepare = false;
  sandbox.ZoteroPane.getSelectedItems = () => [regularItem(1)];
  await sandbox.citeItems();
  assert.deepEqual(insertedIDs, [1], "selection must be captured before async Word command");
  assert.equal(deleted, 1, "successful field must not be removed");
}
tests.push(testStartupCancellation, testRenameRollbackAndObsoleteRename,
  testCiteSelectionAndNativeFailureRecovery, testInsertRollbackAndCapturedSelection);
(async () => {
  for (const test of tests) { await test(); console.log(`PASS ${test.name}`); }
  console.log(`${manifest.version}: ${tests.length} stability suites passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });



