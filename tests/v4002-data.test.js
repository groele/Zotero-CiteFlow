const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourceDirectory = process.env.CITATION_SOURCE_DIR || ".";
const sourcePath = path.join(__dirname, "..", sourceDirectory, "chrome", "content", "scripts", "index.js");
const source = fs.readFileSync(sourcePath, "utf8").replace(/\r\n/g, "\n");
const start = source.indexOf("  var Citation = class {");
const endMarker = "\n  };\n\n  // src/modules/cite.mjs";
const end = source.indexOf(endMarker, start);
assert.ok(start >= 0 && end > start, "Citation class must be extractable from the V40.0.2 bundle");

const prefStore = new Map();
const sandbox = {
  MANAGED_TAG_IDS_PREF: "zotero-citation.managedCitationTagIDs",
  MANAGED_TAG_STATE_PREF: "zotero-citation.managedCitationTagState",
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  addon: { data: {} },
  runtime: { log() {} },
  window: { setTimeout, clearTimeout, setInterval, clearInterval },
  ZoteroPane: { itemsView: { refreshAndMaintainSelection() {} } },
  Zotero: {
    Prefs: {
      get(key, global = false) { return prefStore.get(global ? key : `extensions.zotero.${key}`); },
      set(key, value, global = false) { prefStore.set(global ? key : `extensions.zotero.${key}`, value); }
    },
    Promise: { delay: async () => {} },
    Libraries: { userLibraryID: 1 },
    Items: { get: () => null },
    Integration: { sessions: {} }
  }
};
vm.createContext(sandbox);
vm.runInContext(`${source.slice(start, end + 5)}\nglobalThis.__Citation = Citation;`, sandbox);
const Citation = sandbox.__Citation;

function bareCitation() {
  const instance = Object.create(Citation.prototype);
  instance.sessions = {};
  instance._listenerStopped = false;
  instance._temporaryCollectionKeys = new Set();
  instance._managedCitationTagIDs = {};
  instance._citationTagName = "/Citations";
  instance._sessionCitedIDs = {};
  instance._lastTagSyncSig = {};
  instance._pendingTagSyncIDsBySession = {};
  instance._tagSyncInFlightBySession = {};
  instance._tagSyncTimerBySession = {};
  instance._sessionUpdateQueue = {};
  instance._sessionUpdateRevision = {};
  instance._sortedCacheBySession = {};
  instance._lastRefreshAt = {};
  instance._minRefreshInterval = 0;
  instance._emptyReadCountBySession = {};
  instance._missingSessionCountBySession = {};
  instance._refreshRetryTimerBySession = {};
  instance._docIdBySession = {};
  instance._collectionRenameRetryTimerBySession = {};
  instance._collectionRenameRetryCountBySession = {};
  instance._bumpDebugCounter = () => {};
  instance._recordPerf = () => {};
  instance._saveManagedTagIDs = () => {};
  instance.debugLog = () => {};
  instance.logError = () => {};
  instance.scheduleItemsViewRefresh = () => {};
  return instance;
}

async function testMalformedCacheFallsBackSafely() {
  const instance = bareCitation();
  instance._sortedCacheBySession.cache_S = { sig: "_empty", result: { broken: true } };
  assert.deepEqual([...instance.getSortedItemIDs({}, "S")], []);
  instance._sortedCacheBySession.cache_S = { sig: "_empty", result: [1, "broken"] };
  assert.deepEqual([...instance.getSortedItemIDs({}, "S")], []);
  instance._sortedCacheBySession = null;
  assert.deepEqual([...instance.getSortedItemIDs({}, "S")], []);
}

async function testEmptySnapshotNeedsTwoReadsAndMismatchIsPreserved() {
  const instance = bareCitation();
  const updates = [];
  instance.sessions.S = { idData: { 1: { plainCitation: "1: A" } } };
  instance.updateCitations = async (...args) => updates.push(args.slice(1, 3));
  instance.scheduleCitationTagSync = () => {};
  instance._scheduleSessionRefresh = () => {};
  const empty = { citationsByItemID: {}, citationsByIndex: {}, styleClass: "in-text" };
  await instance.refreshSessionCitations("S", empty);
  assert.equal(updates.length, 0);
  await instance.refreshSessionCitations("S", empty);
  assert.equal(updates.length, 1);
  assert.equal(Object.keys(updates[0][0]).length, 0);
  assert.equal(updates[0][1].length, 0);

  const mismatch = { citationsByItemID: { 1: [{ properties: { plainCitation: "A" } }] }, citationsByIndex: {}, styleClass: "in-text" };
  instance.sessions.S.idData = { 1: { plainCitation: "1: A" } };
  updates.length = 0;
  await instance.refreshSessionCitations("S", mismatch);
  assert.equal(updates.length, 0);
  assert.equal(instance.sessions.S.idData[1].plainCitation, "1: A");
}

function makeTaggedItem({ editable = true, saveTx = async () => {} } = {}) {
  const tags = new Set(["/Citations"]);
  return {
    libraryID: 1,
    editable,
    hasTag: tag => tags.has(tag),
    addTag: tag => tags.add(tag),
    removeTag: tag => tags.delete(tag),
    saveTx,
    tags
  };
}

async function testCleanupFailureKeepsManagedOwnership() {
  const instance = bareCitation();
  const item = makeTaggedItem({ editable: false });
  sandbox.Zotero.Items.get = () => item;
  instance._managedCitationTagIDs = { 7: true };
  let saved = 0;
  instance._saveManagedTagIDs = () => { saved += 1; };
  instance._sessionCitedIDs = { S: [] };
  await instance.syncCitationTags("S", []);
  assert.equal(instance._managedCitationTagIDs[7], true);
  assert.equal(saved, 0, "skipped read-only cleanup does not change ownership");

  item.editable = true;
  item.saveTx = async () => { throw new Error("locked"); };
  await instance.syncCitationTags("S", []);
  assert.equal(instance._managedCitationTagIDs[7], true);
  assert.equal(item.tags.has("/Citations"), true, "failed removal must roll back the in-memory tag");
  assert.equal(saved, 1, "failed cleanup must persist the retained ownership record");
}

async function testSharedTagUnionAcrossDocuments() {
  const instance = bareCitation();
  const item = makeTaggedItem();
  item.tags.clear();
  let saves = 0;
  item.saveTx = async () => { saves += 1; };
  sandbox.Zotero.Items.get = () => item;
  instance._sessionCitedIDs = { A: [7], B: [7] };
  await Promise.all([instance.syncCitationTags("A", [7]), instance.syncCitationTags("B", [7])]);
  assert.equal(item.tags.has("/Citations"), true);
  assert.equal(saves, 1, "same shared item should be tagged once");
  instance._sessionCitedIDs.A = [];
  await instance.syncCitationTags("A", []);
  assert.equal(item.tags.has("/Citations"), true, "one document must not remove another document's tag");
  instance._sessionCitedIDs.B = [];
  await instance.syncCitationTags("B", []);
  assert.equal(item.tags.has("/Citations"), false);
}

async function testGlobalTagQueueWaitsForInFlightWrite() {
  const instance = bareCitation();
  const order = [];
  let release;
  instance._syncCitationTags = async sessionID => {
    order.push(`start:${sessionID}`);
    if (sessionID === "A") await new Promise(resolve => { release = resolve; });
    order.push(`end:${sessionID}`);
  };
  const first = instance.syncCitationTags("A", [1]);
  await new Promise(resolve => setImmediate(resolve));
  const shutdown = instance.syncCitationTags("__shutdown__", []);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ["start:A"]);
  release();
  await Promise.all([first, shutdown]);
  assert.deepEqual(order, ["start:A", "end:A", "start:__shutdown__", "end:__shutdown__"]);
}

async function testFailedCollectionEraseKeepsPersistentKey() {
  const instance = bareCitation();
  const collection = {
    id: 11,
    key: "TEMP",
    name: "Word.docx",
    getChildItems: () => [],
    eraseTx: async () => { throw new Error("locked"); }
  };
  instance.sessions.S = { collection };
  instance._temporaryCollectionKeys.add("TEMP");
  prefStore.set("zotero-citation.temporaryCollectionKeys", '["TEMP"]');
  instance._saveKeySet = (key, values) => {
    if (key === "zotero-citation.temporaryCollectionKeys") {
      prefStore.set(key, JSON.stringify([...values]));
    }
  };
  await instance.clearSession("S", true);
  assert.deepEqual([...instance._temporaryCollectionKeys], ["TEMP"]);
  assert.equal(prefStore.get("zotero-citation.temporaryCollectionKeys"), '["TEMP"]');
}

async function testTagBatchYieldsOnlyOncePerThirtyWrites() {
  const instance = bareCitation();
  const items = new Map();
  for (let id = 1; id <= 130; id++) {
    const item = makeTaggedItem();
    if (id <= 30) item.tags.clear();
    items.set(id, item);
  }
  sandbox.Zotero.Items.get = id => items.get(id);
  const originalDelay = sandbox.Zotero.Promise.delay;
  let yields = 0;
  sandbox.Zotero.Promise.delay = async () => { yields++; };
  try {
    instance._sessionCitedIDs = { S: [...items.keys()] };
    await instance.syncCitationTags("S", [...items.keys()]);
    assert.equal(yields, 1, "unchanged items after the thirtieth write must not each yield again");
  } finally {
    sandbox.Zotero.Promise.delay = originalDelay;
  }
}

async function testCustomTagToggleRenameAndManualOwnership() {
  const instance = bareCitation();
  instance._citationTagsEnabled = true;
  const managed = makeTaggedItem(); managed.tags.clear();
  const manual = makeTaggedItem(); manual.tags.add("已引用");
  const items = new Map([[7, managed], [8, manual]]);
  sandbox.Zotero.Items.get = id => items.get(id);
  instance._sessionCitedIDs = { A: [7], B: [8] };
  const enableKey = "extensions.zotero.zoterocitation.citationTags.enable";
  const textKey = "extensions.zotero.zoterocitation.citationTags.text";
  prefStore.set(enableKey, true); prefStore.set(textKey, "/Citations");
  try {
    await instance.syncCitationTags("A", [7]);
    assert.equal(managed.tags.has("/Citations"), true);
    assert.equal(instance._managedCitationTagIDs[8], undefined, "manual tags must not become plugin-owned");
    prefStore.set(textKey, "已引用"); await instance.applyPreferences();
    assert.equal(managed.tags.has("/Citations"), false); assert.equal(managed.tags.has("已引用"), true);
    assert.equal(manual.tags.has("/Citations"), true); assert.equal(manual.tags.has("已引用"), true);
    assert.equal(instance._managedCitationTagIDs[8], undefined, "pre-existing custom tags must not become plugin-owned");
    assert.equal(instance._managedCitationTagNames[7], "已引用");
    Citation.prototype._saveManagedTagIDs.call(instance);
    const restored = instance._loadManagedTagState();
    assert.equal(restored.names[7], "已引用"); assert.equal(restored.ids[7], true);
    prefStore.set(enableKey, false); await instance.applyPreferences();
    assert.equal(managed.tags.size, 0); assert.equal(manual.tags.size, 2);
    assert.deepEqual(Object.keys(instance._sessionCitedIDs).sort(), ["A", "B"], "tracking remains intact");
    await instance.syncCitationTags("A", [7]); assert.equal(managed.tags.size, 0);
    prefStore.set(enableKey, true); await instance.applyPreferences();
    assert.equal(managed.tags.has("已引用"), true);
  } finally { prefStore.delete(enableKey); prefStore.delete(textKey); }
}

async function testFailedTagRenameRetainsOwnershipAndRollsBack() {
  const instance = bareCitation(); instance._citationTagsEnabled = true;
  const item = makeTaggedItem({ saveTx: async () => { throw Error("locked"); } });
  instance._managedCitationTagIDs = { 7: true }; instance._managedCitationTagNames = { 7: "/Citations" };
  instance._sessionCitedIDs = { A: [7] }; sandbox.Zotero.Items.get = () => item;
  const textKey = "extensions.zotero.zoterocitation.citationTags.text";
  prefStore.set(textKey, "已引用");
  try {
    const result = await instance.applyPreferences();
    assert.equal(result.complete, false); assert.equal(instance._tagPreferencesNeedSync, true);
    assert.equal(item.tags.has("/Citations"), true); assert.equal(item.tags.has("已引用"), false);
    assert.equal(instance._managedCitationTagNames[7], "/Citations");
    let saves = 0; item.saveTx = async () => { saves++; };
    const recovered = await instance.applyPreferences();
    assert.equal(recovered.complete, true); assert.equal(saves, 1, "rename must save removal and addition together");
    assert.equal(item.tags.has("已引用"), true); assert.equal(item.tags.has("/Citations"), false);
  } finally { prefStore.delete(textKey); }
}

async function testCorruptedTagStateNeverAssumesOwnershipOfManualDefaultTags() {
  const instance = bareCitation();
  const legacyKey = 'extensions.zotero.zotero-citation.managedCitationTagIDs';
  const stateKey = 'extensions.zotero.zotero-citation.managedCitationTagState';
  prefStore.set(legacyKey, '["7"]');
  try {
    for (const raw of ['{broken', JSON.stringify({ version: 2, tags: { 7: 'Custom' } }), JSON.stringify({ version: 1, tags: { 7: null } })]) {
      prefStore.set(stateKey, raw);
      assert.deepEqual(Object.keys(instance._loadManagedTagState().ids), [], raw);
    }
    prefStore.delete(stateKey);
    assert.equal(instance._loadManagedTagState().names[7], '/Citations', 'only missing new-format state allows legacy migration');
    prefStore.set(stateKey, JSON.stringify({ version: 1, tags: { 7: 'Custom', 8: '/Citations' } }));
    assert.equal(instance._loadManagedTagState().names[7], 'Custom');
  } finally { prefStore.delete(legacyKey); prefStore.delete(stateKey); }
}

async function testReadOnlyCustomTagCleanupRetainsNameAndRecovers() {
  const instance = bareCitation(); instance._citationTagsEnabled = true;
  const item = makeTaggedItem({ editable: false }); item.tags.clear(); item.tags.add('已引用');
  instance._citationTagName = '已引用'; instance._managedCitationTagIDs = { 7: true };
  instance._managedCitationTagNames = { 7: '已引用' }; instance._sessionCitedIDs = { A: [7] };
  sandbox.Zotero.Items.get = () => item;
  const key = 'extensions.zotero.zoterocitation.citationTags.enable'; prefStore.set(key, false);
  try {
    const result = await instance.applyPreferences(); assert.equal(result.complete, false);
    assert.equal(item.tags.has('已引用'), true); assert.equal(instance._managedCitationTagNames[7], '已引用');
    item.editable = true;
    const retried = await instance.applyPreferences(); assert.equal(retried.complete, true); assert.equal(item.tags.size, 0);
  } finally { prefStore.delete(key); }
}

async function testOwnershipWriteFailureIsReportedAndRetried() {
  const instance = bareCitation(); instance._citationTagsEnabled = true;
  const item = makeTaggedItem(); item.tags.clear(); sandbox.Zotero.Items.get = () => item;
  instance._sessionCitedIDs = { A: [7] }; instance._saveManagedTagIDs = () => false;
  const result = await instance.syncCitationTags('A', [7]); assert.equal(result.complete, false);
  let retriedSaves = 0; instance._saveManagedTagIDs = () => { retriedSaves++; return true; };
  const retried = await instance.syncCitationTags('A', [7]); assert.equal(retried.complete, true);
  assert.equal(retriedSaves, 1, 'failed ownership persistence must retry even when the item tag already exists');
  assert.equal(item.tags.has('/Citations'), true); assert.equal(instance._managedCitationTagIDs[7], true);
}

async function testDisableDuringInFlightTagSaveClearsCommittedTag() {
  const instance = bareCitation(); instance._citationTagsEnabled = true;
  const item = makeTaggedItem(); item.tags.clear();
  let release; item.saveTx = () => new Promise(resolve => { release = resolve; });
  instance._sessionCitedIDs = { A: [7] }; sandbox.Zotero.Items.get = () => item;
  const first = instance.syncCitationTags("A", [7]);
  await new Promise(resolve => setImmediate(resolve));
  const enableKey = "extensions.zotero.zoterocitation.citationTags.enable";
  prefStore.set(enableKey, false);
  const disabling = instance.applyPreferences();
  item.saveTx = async () => {}; release();
  try { await Promise.all([first, disabling]); assert.equal(item.tags.size, 0); assert.equal(instance._managedCitationTagIDs[7], undefined); }
  finally { prefStore.delete(enableKey); }
}

const tests = [testMalformedCacheFallsBackSafely, testEmptySnapshotNeedsTwoReadsAndMismatchIsPreserved,
  testCleanupFailureKeepsManagedOwnership, testSharedTagUnionAcrossDocuments,
  testGlobalTagQueueWaitsForInFlightWrite, testFailedCollectionEraseKeepsPersistentKey,
  testTagBatchYieldsOnlyOncePerThirtyWrites, testCustomTagToggleRenameAndManualOwnership,
  testFailedTagRenameRetainsOwnershipAndRollsBack, testDisableDuringInFlightTagSaveClearsCommittedTag,
  testCorruptedTagStateNeverAssumesOwnershipOfManualDefaultTags, testReadOnlyCustomTagCleanupRetainsNameAndRecovers,
  testOwnershipWriteFailureIsReportedAndRetried];
(async () => {
  for (const test of tests) {
    await test();
    console.log(`PASS ${test.name}`);
  }
  console.log(`V40.0.2 data suites passed: ${tests.length}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
