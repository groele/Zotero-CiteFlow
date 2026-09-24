const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourceDirectory = process.env.CITATION_SOURCE_DIR || ".";
const sourcePath = path.join(__dirname, "..", sourceDirectory, "chrome", "content", "scripts", "index.js");
const source = fs.readFileSync(sourcePath, "utf8").replace(/\r\n/g, "\n");
const classStart = source.indexOf("  var Citation = class {");
const classEnd = source.indexOf("\n  };\n\n  // src/modules/cite.ts", classStart);
const citeStart = source.indexOf("  var citeItemsInFlight = false;");
const citeEnd = source.indexOf("\n  // src/modules/views.ts", citeStart);
assert.ok(classStart >= 0 && classEnd > classStart, "Citation class must be extractable");
assert.ok(citeStart >= 0 && citeEnd > citeStart, "cite module must be extractable");

const prefStore = new Map();
const sandbox = {
  console,
  addon: { data: { alive: true } },
  config: { addonID: "zoterocitation@polygon.org", addonRef: "zoterocitation" },
  getString: key => key,
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
  ZoteroPane: { getSelectedItems: () => [] },
  Zotero_Tabs: { selectedIndex: 0 },
  Zotero: {
    Prefs: {
      get(key, global = false) { return prefStore.get(global ? key : `extensions.zotero.${key}`); },
      set(key, value, global = false) { prefStore.set(global ? key : `extensions.zotero.${key}`, value); }
    },
    Promise: { delay: async () => {}, resolve: value => Promise.resolve(value) },
    Integration: { sessions: {} },
    Libraries: { userLibraryID: 1 },
    Items: { get: () => null },
    ItemTreeManager: { async registerColumns() {} },
    Exception: { UserCancelled: class UserCancelled extends Error {} },
    logError() {}
  }
};
vm.createContext(sandbox);
vm.runInContext(`${source.slice(classStart, classEnd + 5)}\nglobalThis.__Citation = Citation;`, sandbox);
vm.runInContext(`${source.slice(citeStart, citeEnd)}\nglobalThis.__citeItems = citeItems;`, sandbox);
const Citation = sandbox.__Citation;

function bareCitation() {
  const instance = Object.create(Citation.prototype);
  instance.sessions = {};
  instance._missingSessionCountBySession = {};
  instance._temporaryCollectionKeys = new Set();
  instance._execCommandWaitTimeoutMs = 100;
  instance._execCommandPollIntervalMs = 1;
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
  instance._cacheCleanupTimer = null;
  return instance;
}

function collection(name) {
  return { id: name, key: name, name, saveTx: async () => {}, eraseTx: async () => {} };
}

async function hookedFixture(nativeCommand) {
  const instance = bareCitation();
  instance.clearStaleArtifacts = async () => {};
  instance.sessions = {
    A: { collection: collection("A"), idData: {} },
    B: { collection: collection("B"), idData: {} }
  };
  sandbox.Zotero.ZoteroCitation = { api: {} };
  sandbox.Zotero.Integration.sessions = {
    A: { sessionID: "A" },
    B: { sessionID: "B" }
  };
  sandbox.Zotero.Integration.currentSession = sandbox.Zotero.Integration.sessions.A;
  sandbox.Zotero.Integration.getSession = async (_app, doc) => [sandbox.Zotero.Integration.sessions[doc.id], false];
  sandbox.Zotero.Integration.execCommand = nativeCommand || (async (agent, command, docId) => {
    const result = await sandbox.Zotero.Integration.getSession(null, { id: docId === "B.docx" ? "B" : "A" }, agent, command);
    sandbox.Zotero.Integration.currentSession = result[0];
    return "native-ok";
  });
  await instance.listener(1000000);
  clearTimeout(instance._listenerTimer);
  instance._listenerTimer = null;
  return instance;
}

async function dispose(instance) {
  instance.syncCitationTags = async () => {};
  instance.clearSession = async () => {};
  await instance.clear();
}

async function testNativeSignaturesAndTargetName() {
  let observed;
  const instance = await hookedFixture(async function(...args) {
    observed = { self: this, args };
    const result = await sandbox.Zotero.Integration.getSession(null, { id: "B" }, args[0], args[1], "extra");
    sandbox.Zotero.Integration.currentSession = result[0];
    return "native-ok";
  });
  try {
    const receiver = { marker: true };
    assert.equal(await sandbox.Zotero.Integration.execCommand.call(receiver, "WinWord", "refresh", "B.docx", 1, "tail"), "native-ok");
    assert.equal(observed.self, receiver);
    assert.deepEqual(observed.args, ["WinWord", "refresh", "B.docx", 1, "tail"]);
    assert.equal(instance.activeSessionID, "B");
    assert.equal(instance.sessions.B.collection.name, "B.docx");
  } finally {
    await dispose(instance);
  }
}

async function testMacWordPlaceholderNeverBecomesDocument() {
  const instance = await hookedFixture(async (agent, command) => {
    const result = await sandbox.Zotero.Integration.getSession(null, { id: "A" }, agent, command);
    sandbox.Zotero.Integration.currentSession = result[0];
    return "ok";
  });
  try {
    instance._docIdBySession.A = "real.docx";
    instance.sessions.A.docId = "real.docx";
    sandbox.addon.data.docId = "real.docx";
    await sandbox.Zotero.Integration.execCommand("MacWord16", "addEditCitation", "/Applications/Microsoft Word.app/", 2);
    assert.equal(instance._docIdBySession.A, undefined);
    assert.equal(instance.sessions.A.docId, undefined);
    assert.equal(sandbox.addon.data.docId, undefined);
    assert.equal(instance.sessions.A.collection.name, "A");
  } finally {
    await dispose(instance);
  }
}

async function testConcurrentCommandsNeverCrossBind() {
  const instance = await hookedFixture(async (agent, command, docId) => {
    const id = docId === "A.docx" ? "A" : "B";
    const result = await sandbox.Zotero.Integration.getSession(null, { id }, agent, command);
    sandbox.Zotero.Integration.currentSession = result[0];
    await new Promise(resolve => setTimeout(resolve, 2));
    return id;
  });
  try {
    const [a, b] = await Promise.all([
      sandbox.Zotero.Integration.execCommand("WinWord", "refresh", "A.docx"),
      sandbox.Zotero.Integration.execCommand("WinWord", "refresh", "B.docx")
    ]);
    assert.deepEqual([a, b], ["A", "B"]);
    assert.equal(instance.sessions.A.collection.name, "A");
    assert.equal(instance.sessions.B.collection.name, "B");
    assert.equal(instance._execCommandBindings.size, 0);
  } finally {
    await dispose(instance);
  }
}

async function testInsertionFailureDeletesNewField(modern = false, existing = false, multiple = false) {
  sandbox.Zotero_Tabs = { selectedIndex: 0 };
  sandbox.addon.data.alive = true;
  let deleted = 0;
  sandbox.Zotero.Integration.CitationField = class {
    constructor(field) { this._field = field; }
    async delete() { deleted += 1; }
    async getNoteIndex() { return 0; }
    async unserialize() { return {}; }
    get type() { return 1; }
  };
  sandbox.Zotero.Integration.Field = { loadExisting: async field => field };
  sandbox.Zotero.Integration.Citation = class {
    constructor(field) { this.field = field; this.citationItems = []; }
    get _field() { return this.field; }
    async prepareForEditing() {}
  };
  sandbox.Zotero.Integration.CitationEditInterface = class { constructor(citation) { this.citation = citation; } };
  const session = {
    sessionID: "S",
    style: { opt: {} },
    data: { prefs: { delayCitationUpdates: true } },
    citationsByItemID: {},
    async addField() { return {}; },
    async getFields() { return []; },
    async updateFromDocument() {},
    async _insertCitingResult(index, field, citation) { citation.fieldIndex = 4; return multiple ? [citation, citation] : [citation]; },
    async addCitation(index, noteIndex, citation) {
      assert.equal(index, 4, "native Zotero 10 fieldIndex must reach addCitation");
      assert.equal(citation.field.getNoteIndex instanceof Function, true);
      if (!modern || (multiple && ++writes === 2)) throw new Error("write failed");
    }
  };
  sandbox.Zotero.Integration.Session = function() {};
  sandbox.Zotero.Integration.Session.prototype.cite = async () => "native-cite";
  let writes = 0;
  sandbox.Zotero.Integration.execCommand = async () => sandbox.Zotero.Integration.Session.prototype.cite.call(session,
    existing ? new sandbox.Zotero.Integration.CitationField({}) : undefined);
  sandbox.ZoteroPane.getSelectedItems = () => [{ id: 7, isRegularItem: () => true, isTopLevelItem: () => true }];
  if (modern && !multiple) {
    await sandbox.__citeItems();
    assert.equal(deleted, 0, "successful native-shaped insertion preserves its field");
  } else {
    await assert.rejects(sandbox.__citeItems(), /write failed/);
    assert.equal(deleted, existing || multiple ? 0 : 1, "rollback only deletes new, uncommitted fields");
  }
}
async function testNative10CitationShape() { await testInsertionFailureDeletesNewField(true); }
async function testExistingFieldFailurePreservesDocument() { await testInsertionFailureDeletesNewField(false, true); }
async function testPartialRegistrationPreservesCommittedField() { await testInsertionFailureDeletesNewField(true, false, true); }

async function testWrapperChainSurvivesClear() {
  let observed;
  const native = function(...args) { observed = { self: this, args }; return "native"; };
  const instance = await hookedFixture(native);
  const inner = sandbox.Zotero.Integration.execCommand;
  const outer = function(...args) { return inner.apply(this, args); };
  sandbox.Zotero.Integration.execCommand = outer;
  await dispose(instance);
  const receiver = { marker: true };
  assert.equal(await outer.call(receiver, "WinWord", "refresh", "A.docx", 1), "native");
  assert.equal(observed.self, receiver);
  assert.deepEqual(observed.args, ["WinWord", "refresh", "A.docx", 1]);
}

const tests = [testNativeSignaturesAndTargetName, testMacWordPlaceholderNeverBecomesDocument,
  testConcurrentCommandsNeverCrossBind, testInsertionFailureDeletesNewField, testNative10CitationShape,
  testExistingFieldFailurePreservesDocument, testPartialRegistrationPreservesCommittedField, testWrapperChainSurvivesClear];
(async () => {
  for (const test of tests) {
    await test();
    console.log(`PASS ${test.name}`);
  }
  console.log(`V40.0.2 Word behavior: ${tests.length} suites passed`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
