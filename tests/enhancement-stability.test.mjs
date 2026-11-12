import test from "node:test";
import assert from "node:assert/strict";

import { Citation } from "../src/modules/citation.ts";
import Addon from "../src/addon.ts";
import {
  buildRefreshInputFingerprint,
  collectChangedCitationItemIDs,
  commitAppliedSessionCitations,
  refreshItemsViewTargeted,
  updateSessionCitationsIfDirty
} from "../src/modules/citation/refresh-helpers.ts";
import {
  computeNextListenerDelay,
  finalizeExecCommandCycle,
  finishListenerTick,
  prepareTickProbeWindow,
  syncForegroundActiveSession
} from "../src/modules/citation/session-sync-helpers.ts";

function createTestCitation() {
  const c = Object.create(Citation.prototype);
  c._initSessionTracking();
  c._initWordIntegrationState();
  c._initTimersAndDebounce();
  c._resetInternalTrackingMaps();
  c._collectionsEnabled = true;
  c.logError = () => {};
  c.debugLog = () => {};
  c._recordPerf = () => {};
  c._bumpDebugCounter = () => {};
  c._invalidateSessionIndex = () => {};
  c.scheduleCitationTagSync = () => {};
  return c;
}

test("P1-B syncs activeSessionID uniquely from foreground Word window and leaves Zotero/ambiguous focus untouched", () => {
  const prevAddon = globalThis.addon;
  try {
    const c = createTestCitation();
    c.sessions = {
      S1: { closing: false, docId: "D:\\Work\\Alpha.docx", idData: { 10: { plainCitation: "1: Alpha" } } },
      S2: { closing: false, docId: "D:\\Work\\Beta.docx", idData: { 20: { plainCitation: "1: Beta" } } }
    };
    c._docIdBySession = { S1: "D:\\Work\\Alpha.docx", S2: "D:\\Work\\Beta.docx" };
    c.activeSessionID = "S1";

    const refreshes = [];
    c.scheduleItemsViewRefresh = (target) => refreshes.push(target);

    let fgTitle = "Beta.docx - 已保存到此电脑 - Word";
    let fgProbeCalls = 0;
    globalThis.addon = {
      data: {
        alive: true,
        probeForegroundWordTitle: () => {
          fgProbeCalls++;
          return fgTitle;
        }
      }
    };

    assert.equal(syncForegroundActiveSession(c), true);
    assert.equal(c.activeSessionID, "S2");
    assert.deepEqual(refreshes, [[10, 20]], "Session switch must request targeted refresh only for union of cited item IDs");

    // Switching back to Zotero (non-Word foreground) must retain S2 rather than clearing activeSessionID
    fgTitle = "";
    assert.equal(syncForegroundActiveSession(c), false);
    assert.equal(c.activeSessionID, "S2");

    // Ambiguous duplicate basenames must never guess activeSessionID
    c.sessions = {
      S1: { closing: false, docId: "D:\\FolderA\\paper.docx", idData: {} },
      S2: { closing: false, docId: "D:\\FolderB\\paper.docx", idData: {} }
    };
    c._docIdBySession = { S1: "D:\\FolderA\\paper.docx", S2: "D:\\FolderB\\paper.docx" };
    c.activeSessionID = "S1";
    fgTitle = "paper.docx - Word";
    assert.equal(syncForegroundActiveSession(c), false);
    assert.equal(c.activeSessionID, "S1");

    // Single tracked session already active skips Win32 foreground probe completely
    const beforeCalls = fgProbeCalls;
    c.sessions = { S1: { closing: false, docId: "D:\\FolderA\\paper.docx", idData: {} } };
    assert.equal(syncForegroundActiveSession(c), false);
    assert.equal(fgProbeCalls, beforeCalls);
  } finally {
    if (prevAddon === undefined) delete globalThis.addon; else globalThis.addon = prevAddon;
  }
});

test("duplicate Word window titles do not collapse via Set and distinct duplicate paths disambiguate collection names", () => {
  const prevAddon = globalThis.addon;
  try {
    const c = createTestCitation();
    globalThis.addon = {
      data: {
        alive: true,
        probeWordWindowTitles: () => ({
          foregroundTitle: "",
          visibleTitles: ["paper.docx - Word", "paper.docx - Word"]
        })
      }
    };

    c.sessions = { S1: { closing: false } };
    assert.equal(c._resolveFallbackDocumentId("S1", {}, null, false), "",
      "Two visible windows sharing the same title must stay ambiguous rather than collapsing via Set");

    // Once S1 has a confirmed path docId, multiset subtraction leaves 1 candidate for S2, and refuses 3rd S3 collision
    c.sessions = {
      S1: { closing: false, docId: "D:\\FolderA\\paper.docx" },
      S2: { closing: false }
    };
    c._docIdBySession = { S1: "D:\\FolderA\\paper.docx" };
    assert.equal(c._resolveFallbackDocumentId("S2", {}, null, false), "window-title:paper.docx");

    c.sessions.S2.docId = "window-title:paper.docx";
    c._docIdBySession.S2 = "window-title:paper.docx";
    c.sessions.S3 = { closing: false };
    assert.equal(c._resolveFallbackDocumentId("S3", {}, null, false), "",
      "Must never assign duplicate window-title ID already claimed by S2");

    // Path disambiguation for distinct files with identical filename
    c.sessions = {
      S1: { closing: false, docId: "D:\\ProjectA\\paper.docx" },
      S2: { closing: false, docId: "D:\\ProjectB\\paper.docx" },
      S3: { closing: false, docId: "D:\\Solo\\unique.docx" }
    };
    c._docIdBySession = {
      S1: "D:\\ProjectA\\paper.docx",
      S2: "D:\\ProjectB\\paper.docx",
      S3: "D:\\Solo\\unique.docx"
    };
    assert.equal(c._getDocumentDisplayName("D:\\ProjectA\\paper.docx"), "paper.docx");
    assert.equal(c._getUniqueCollectionDisplayName("S1", "D:\\ProjectA\\paper.docx"), "paper.docx (ProjectA)");
    assert.equal(c._getUniqueCollectionDisplayName("S2", "D:\\ProjectB\\paper.docx"), "paper.docx (ProjectB)");
    assert.equal(c._getUniqueCollectionDisplayName("S3", "D:\\Solo\\unique.docx"), "unique.docx");

    // Escalates depth automatically when immediate parent folder also ties
    c.sessions.S1.docId = "D:\\Work\\2025\\paper.docx";
    c.sessions.S2.docId = "D:\\Archive\\2024\\2025\\paper.docx";
    c._docIdBySession.S1 = "D:\\Work\\2025\\paper.docx";
    c._docIdBySession.S2 = "D:\\Archive\\2024\\2025\\paper.docx";
    assert.equal(c._getUniqueCollectionDisplayName("S1", "D:\\Work\\2025\\paper.docx"), "paper.docx (Work/2025)");
    assert.equal(c._getUniqueCollectionDisplayName("S2", "D:\\Archive\\2024\\2025\\paper.docx"), "paper.docx (2024/2025)");
  } finally {
    if (prevAddon === undefined) delete globalThis.addon; else globalThis.addon = prevAddon;
  }
});

test("background window probing honors 3s cooldown and adaptive listener backoff compensates overlap completion", () => {
  const prevAddon = globalThis.addon;
  const origSetTimeout = globalThis.setTimeout;
  const origClearTimeout = globalThis.clearTimeout;
  try {
    const c = createTestCitation();
    let probeCount = 0;
    globalThis.addon = {
      data: {
        alive: true,
        probeWordWindowTitles: () => {
          probeCount++;
          return { foregroundTitle: "", visibleTitles: ["Draft.docx - Word"] };
        }
      }
    };
    c.sessions = { S1: { closing: false } };

    // First background tick probes once
    prepareTickProbeWindow(c);
    assert.equal(c._resolveFallbackDocumentId("S1", {}, null, false), "window-title:Draft.docx");
    assert.equal(probeCount, 1);

    // Immediate second tick hits 3s cooldown and skips ctypes window scan
    prepareTickProbeWindow(c);
    assert.equal(c._resolveFallbackDocumentId("S1", {}, null, false), "");
    assert.equal(probeCount, 1);

    // Expired cooldown (> 3000ms) or allowForeground=true probes immediately
    c._lastBgWindowProbeAt = Date.now() - 3500;
    prepareTickProbeWindow(c);
    assert.equal(c._resolveFallbackDocumentId("S1", {}, null, false), "window-title:Draft.docx");
    assert.equal(probeCount, 2);

    // Adaptive backoff curve preserves sub-500ms & large test intervals, backs off 1s -> 3s after 5 idle ticks
    assert.equal(computeNextListenerDelay(100, 10), 100);
    assert.equal(computeNextListenerDelay(1000000, 10), 1000000);
    assert.equal(computeNextListenerDelay(1000, 4), 1000);
    assert.equal(computeNextListenerDelay(1000, 5), 3000);

    const scheduledDelays = [];
    let fakeTimer = 10;
    const cleared = [];
    globalThis.clearTimeout = (id) => cleared.push(id);
    c._scheduleListenerTick = (delay) => {
      scheduledDelays.push(delay);
      c._listenerTimer = ++fakeTimer;
    };
    c._listenerBaseInterval = 1000;
    c.sessions = { S1: { closing: false, collection: { name: "Draft.docx" } } };
    for (let i = 0; i < 6; i++) {
      const epoch = prepareTickProbeWindow(c);
      finishListenerTick(c, 1000, epoch);
    }
    assert.equal(scheduledDelays.at(-1), 3000);
    assert.equal(c._isListenerBackedOff, true);

    // Overlapping (ambiguous) execCommand settlement resets cooldown, backoff, and throttle cleanly
    c._execCommandDepth = 0;
    c._lastRefreshAt = { S1: Date.now() };
    finalizeExecCommandCycle(c, true);
    assert.equal(c._lastBgWindowProbeAt, 0);
    assert.equal(c._idleTickCount, 0);
    assert.equal(c._isListenerBackedOff, false);
    assert.deepEqual(c._lastRefreshAt, {});
    assert.equal(cleared.length, 1);
    assert.equal(scheduledDelays.at(-1), 1000);
  } finally {
    globalThis.setTimeout = origSetTimeout;
    globalThis.clearTimeout = origClearTimeout;
    if (prevAddon === undefined) delete globalThis.addon; else globalThis.addon = prevAddon;
  }
});

test("snapshot fingerprint skips unchanged polls and invalidates on trash, style, collection recreate, and sync failure", async () => {
  const prevZotero = globalThis.Zotero;
  try {
    const items = {
      10: { id: 10, libraryID: 1, deleted: false, inTrash: false, isTopLevelItem: () => true }
    };
    globalThis.Zotero = {
      Prefs: { get: () => true },
      Libraries: { userLibraryID: 1 },
      Items: { get: (id) => items[id] || null },
      Integration: { sessions: {} }
    };

    const c = createTestCitation();
    const sessionObj = { collection: { id: 1, key: "COL1", libraryID: 1 }, idData: {} };
    c.sessions = { S1: sessionObj };
    const native = {
      styleClass: "in-text",
      citationsByItemID: { 10: [{ properties: { plainCitation: "Smith, 2024" } }] },
      citationsByIndex: { 0: { citationItems: [{ id: 10 }] } }
    };

    let syncCalls = 0;
    let syncReturn = true;
    c.syncCollectionItems = async () => {
      syncCalls++;
      return syncReturn;
    };
    let refreshViews = 0;
    c.scheduleItemsViewRefresh = () => { refreshViews++; };
    let updateCalls = 0;
    const origUpdate = c.updateCitations.bind(c);
    c.updateCitations = async (...args) => {
      updateCalls++;
      return origUpdate(...args);
    };

    await updateSessionCitationsIfDirty(c, "S1", native, [10], native.citationsByItemID);
    assert.equal(updateCalls, 1);
    assert.equal(syncCalls, 1);
    assert.equal(refreshViews, 1);

    // Unchanged idle call must skip updateCitations + syncCollectionItems + view refresh
    await updateSessionCitationsIfDirty(c, "S1", native, [10], native.citationsByItemID);
    assert.equal(updateCalls, 1);
    assert.equal(syncCalls, 1);
    assert.equal(refreshViews, 1);

    // Trashing item in Zotero invalidates fingerprint immediately
    items[10].inTrash = true;
    await updateSessionCitationsIfDirty(c, "S1", native, [10], native.citationsByItemID);
    assert.equal(updateCalls, 2);

    // Changing Word citation style invalidates fingerprint
    native.styleClass = "note";
    await updateSessionCitationsIfDirty(c, "S1", native, [10], native.citationsByItemID);
    assert.equal(updateCalls, 3);

    // Sync failure prevents caching so next poll retries automatically
    syncReturn = false;
    items[10].inTrash = false;
    await updateSessionCitationsIfDirty(c, "S1", native, [10], native.citationsByItemID);
    assert.equal(updateCalls, 4);
    syncReturn = true;
    await updateSessionCitationsIfDirty(c, "S1", native, [10], native.citationsByItemID);
    assert.equal(updateCalls, 5, "Failed syncCollectionItems must prevent fingerprint poisoning");
    await updateSessionCitationsIfDirty(c, "S1", native, [10], native.citationsByItemID);
    assert.equal(updateCalls, 5, "Recovered clean state stabilizes again");

    // Collection key change / recreation triggers resync
    sessionObj.collection = { id: 2, key: "COL2", libraryID: 1 };
    await updateSessionCitationsIfDirty(c, "S1", native, [10], native.citationsByItemID);
    assert.equal(updateCalls, 6);

    assert.deepEqual(
      collectChangedCitationItemIDs({ 1: { plainCitation: "A" }, 2: { plainCitation: "B" } }, { 1: { plainCitation: "A" }, 2: { plainCitation: "C" } }),
      [2]
    );
    assert.ok(buildRefreshInputFingerprint("in-text", [10], native.citationsByItemID, sessionObj, true).includes("COL2"));
    assert.equal(typeof commitAppliedSessionCitations, "function");
  } finally {
    if (prevZotero === undefined) delete globalThis.Zotero; else globalThis.Zotero = prevZotero;
  }
});

test("refreshItemsViewTargeted uses row-level invalidation when safe and falls back under sort/overflow/missing APIs", async () => {
  const prevAddon = globalThis.addon;
  try {
    globalThis.addon = {
      data: {
        views: {
          getColumnInfo: () => ({ dataKey: "citeflow@groele-citation" })
        }
      }
    };

    const rowMap = new Map([[10, 0], [20, 4]]);
    let sortFields = ["title"];
    let cachedInvalidated = [];
    let rowInvalidated = [];
    let fullRefreshes = 0;

    const view = {
      invalidateRowCache: (ids) => { cachedInvalidated.push(ids); },
      getRowIndexByID: (id) => (rowMap.has(id) ? rowMap.get(id) : false),
      getSortFields: () => sortFields,
      tree: { invalidateRow: (idx) => { rowInvalidated.push(idx); } },
      refreshAndMaintainSelection: async () => { fullRefreshes++; }
    };

    // Targeted row invalidation for visible rows 10 and 20
    await refreshItemsViewTargeted(view, new Set([10, 20]));
    assert.deepEqual(cachedInvalidated, [[10, 20]]);
    assert.deepEqual(rowInvalidated, [0, 4]);
    assert.equal(fullRefreshes, 0);

    // Off-screen items clear row cache without redrawing tree or doing full refresh
    cachedInvalidated = [];
    rowInvalidated = [];
    await refreshItemsViewTargeted(view, new Set([999]));
    assert.deepEqual(cachedInvalidated, [[999]]);
    assert.deepEqual(rowInvalidated, []);
    assert.equal(fullRefreshes, 0);

    // Sorted by citation column forces full refresh
    sortFields = ["citeflow@groele-citation"];
    await refreshItemsViewTargeted(view, new Set([10]));
    assert.equal(fullRefreshes, 1);

    // Unsorted but oversized (> 200 items) or explicit "full" forces full refresh
    sortFields = ["title"];
    const largeSet = new Set(Array.from({ length: 201 }, (_, i) => i + 1));
    await refreshItemsViewTargeted(view, largeSet);
    assert.equal(fullRefreshes, 2);

    await refreshItemsViewTargeted(view, "full");
    assert.equal(fullRefreshes, 3);

    // Missing tree.invalidateRow (Zotero 11+ or minimal mock) falls back safely
    delete view.tree;
    await refreshItemsViewTargeted(view, new Set([10]));
    assert.equal(fullRefreshes, 4);
  } finally {
    if (prevAddon === undefined) delete globalThis.addon; else globalThis.addon = prevAddon;
  }
});

test("Addon.api.citeItems shows throttled localized busy notice when drag citations overlap and recovers in finally", async () => {
  const prevZotero = globalThis.Zotero;
  const prevZoteroTabs = globalThis.Zotero_Tabs;
  const prevZoteroPane = globalThis.ZoteroPane;
  const prevAddon = globalThis.addon;
  try {
    const notices = [];
    let releaseCmd;
    let execCalls = 0;

    const appStub = {
      getActiveDocument: async () => ({}),
      QueryInterface: () => appStub
    };
    const a = new Addon();
    a.data.locale = { "cite-in-flight": "正在插入上一次引用，请稍候" };
    globalThis.addon = a;

    globalThis.Zotero = {
      isWin: true,
      ProgressWindow: class {
        changeHeadline(msg) { notices.push(msg); }
        show() {}
        startCloseTimer() {}
      },
      getMainWindow: () => null,
      Promise: { resolve: (v) => Promise.resolve(v) },
      Integration: {
        getApplication: () => appStub,
        execCommand: async () => {
          execCalls++;
          await new Promise(resolve => { releaseCmd = resolve; });
        },
        Session: { prototype: { cite() {} } }
      }
    };
    globalThis.Zotero_Tabs = { selectedIndex: 0 };
    globalThis.ZoteroPane = {
      getSelectedItems: () => [{ id: 1, isRegularItem: () => true, isTopLevelItem: () => true }]
    };

    const firstCall = a.api.citeItems([{ id: 1, isRegularItem: () => true, isTopLevelItem: () => true }]);
    await new Promise(r => setImmediate(r));
    assert.equal(execCalls, 1);

    // Two rapid overlapping triggers emit a single throttled notice without entering execCommand again
    await a.api.citeItems([{ id: 2, isRegularItem: () => true, isTopLevelItem: () => true }]);
    await a.api.citeItems([{ id: 3, isRegularItem: () => true, isTopLevelItem: () => true }]);
    assert.equal(execCalls, 1);
    assert.deepEqual(notices, ["正在插入上一次引用，请稍候"]);

    releaseCmd();
    await firstCall;

    // After first settles, subsequent call runs normally
    const secondCall = a.api.citeItems([{ id: 2, isRegularItem: () => true, isTopLevelItem: () => true }]);
    await new Promise(r => setImmediate(r));
    assert.equal(execCalls, 2);
    releaseCmd();
    await secondCall;
  } finally {
    if (prevZotero === undefined) delete globalThis.Zotero; else globalThis.Zotero = prevZotero;
    if (prevZoteroTabs === undefined) delete globalThis.Zotero_Tabs; else globalThis.Zotero_Tabs = prevZoteroTabs;
    if (prevZoteroPane === undefined) delete globalThis.ZoteroPane; else globalThis.ZoteroPane = prevZoteroPane;
    if (prevAddon === undefined) delete globalThis.addon; else globalThis.addon = prevAddon;
  }
});
