import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Citation, CITATION_DOMAIN_MODULES } from "../src/modules/citation.ts";
import Views from "../src/modules/views.ts";
import { ViewsSessionIndex } from "../src/modules/views/session-index.ts";
import { ViewsColumnManager } from "../src/modules/views/column-manager.ts";
import { ViewsWindowPrep } from "../src/modules/views/window-prep.ts";
import { ViewsDragCite } from "../src/modules/views/drag-cite.ts";
import { ViewsIconPatch } from "../src/modules/views/icon-patch.ts";
import { composeDomains } from "../src/modules/domain-composition.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("domain composition rejects coordinator and domain collisions before mutation", () => {
  class Coordinator { existing() {} }
  class Safe { safe() {} }
  class Conflict { existing() {} }
  assert.throws(() => composeDomains(Coordinator.prototype, [Safe, Conflict]), /Duplicate domain member: existing/);
  assert.equal(Object.hasOwn(Coordinator.prototype, "safe"), false);
  class Duplicate { safe() {} }
  assert.throws(() => composeDomains(Coordinator.prototype, [Safe, Duplicate]), /Duplicate domain member: safe/);
  assert.equal(Object.hasOwn(Coordinator.prototype, "safe"), false);
});

function collectSourceFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(mjs|js|ts)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

test("no source module in src/ has monolithic code pileup (> 360 lines)", () => {
  const srcFiles = collectSourceFiles(path.join(root, "src"));
  assert.ok(srcFiles.length >= 27, `Expected at least 27 modular source files, found ${srcFiles.length}`);
  for (const filePath of srcFiles) {
    const rel = path.relative(root, filePath).replace(/\\/g, "/");
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).length;
    assert.ok(
      lines <= 360,
      `Source module ${rel} has ${lines} lines, exceeding the 360-line modular maintainability limit`
    );
  }
});

test("Citation domain modules partition all 72 prototype methods without collision", () => {
  assert.equal(CITATION_DOMAIN_MODULES.length, 10);
  const seenMethods = new Map();

  for (const DomainClass of CITATION_DOMAIN_MODULES) {
    const names = Object.getOwnPropertyNames(DomainClass.prototype).filter(
      name => name !== "constructor"
    );
    assert.ok(names.length > 0, `${DomainClass.name} must define domain methods`);
    for (const name of names) {
      assert.equal(
        seenMethods.has(name),
        false,
        `Method ${name} is duplicated between ${seenMethods.get(name)} and ${DomainClass.name}`
      );
      seenMethods.set(name, DomainClass.name);
      assert.equal(
        typeof Citation.prototype[name],
        "function",
        `Citation.prototype.${name} must be composed from ${DomainClass.name}`
      );
    }
  }

  // Verify decomposed helper methods exist on Citation.prototype
  const expectedDecomposedHelpers = [
    "_sanitizeCheckWaitMs",
    "_loadLegacyManagedTagState",
    "_clearStaleTemporaryCollections",
    "_clearStaleManagedSearches",
    "_pruneMissingWordSessions",
    "_syncActiveWordSessions",
    "_createGetSessionWrapper",
    "_createExecCommandWrapper",
    "_handlePostExecCommand",
    "_hasItemTag",
    "_resolveItemByID",
    "_collectActiveCitedIDSet",
    "_syncActiveItemCitationTag",
    "_removeUncitedManagedItemTag",
    "_readSessionCitationSnapshots",
    "_handleEmptyCitationSnapshot",
    "_formatItemPlainCitation",
    "_restoreWordIntegrationHooks",
    "_resetInternalTrackingMaps"
  ];
  for (const helper of expectedDecomposedHelpers) {
    assert.equal(
      typeof Citation.prototype[helper],
      "function",
      `Expected decomposed helper ${helper} on Citation.prototype`
    );
  }
});

test("Views domain modules partition view responsibilities without collision", () => {
  const viewDomains = [
    ViewsSessionIndex,
    ViewsColumnManager,
    ViewsWindowPrep,
    ViewsDragCite,
    ViewsIconPatch
  ];
  const seenMethods = new Map();

  for (const DomainClass of viewDomains) {
    const names = Object.getOwnPropertyNames(DomainClass.prototype).filter(
      name => name !== "constructor"
    );
    assert.ok(names.length > 0, `${DomainClass.name} must define view domain methods`);
    for (const name of names) {
      assert.equal(
        seenMethods.has(name),
        false,
        `View method ${name} is duplicated between ${seenMethods.get(name)} and ${DomainClass.name}`
      );
      seenMethods.set(name, DomainClass.name);
      assert.equal(
        typeof Views.prototype[name],
        "function",
        `Views.prototype.${name} must be composed from ${DomainClass.name}`
      );
    }
  }
  assert.equal(typeof Views.prototype._resolveSelectedCollectionSessions, "function");
  assert.equal(typeof Views.prototype.createCitationColumn, "function");
  assert.equal(typeof Views.prototype.dispose, "function");
});

test("academic citation ordinal determinism resists non-numeric index keys and malformed item IDs", () => {
  const c = Object.create(Citation.prototype);
  c._sortedCacheBySession = {};
  c.debugLog = () => {};
  c._recordPerf = () => {};

  const pollutedIndex = {
    "NaN": { citationItems: [{ id: 999 }] },
    "-1": { citationItems: [{ id: 888 }] },
    "1.5": { citationItems: [{ id: 777 }] },
    "10": { citationItems: [{ id: " 30 " }, { id: "30.5" }] },
    "2": { citationItems: [{ id: 10 }, { id: 20 }] },
    "__meta__": { citationItems: [{ id: 666 }] },
    "0": { citationItems: [{ id: 5 }] }
  };

  const sorted = c.getSortedItemIDs(pollutedIndex, "S1");
  assert.deepEqual(sorted, [5, 10, 20, 30], "Only non-negative integer indices and positive integer item IDs must determine academic citation order");
});

test("bidirectional torn-snapshot guard protects existing citations when citationsByItemID is mid-update", async () => {
  globalThis.Zotero = {
    Promise: { delay: async () => {} }
  };
  const c = Object.create(Citation.prototype);
  let updateCalls = 0;
  const tornSession = {
    citationsByIndex: { "0": { citationItems: [{ id: 1 }] } },
    citationsByItemID: {},
    async updateFromDocument() {
      updateCalls += 1;
    }
  };

  const snap = await c._readSessionCitationSnapshots(tornSession);
  assert.equal(updateCalls, 1, "Must retry updateFromDocument once on torn snapshot");
  assert.equal(snap.transientMismatch, true, "Persistent torn snapshot (non-empty index, empty itemMap) must be flagged as transientMismatch");
});

test("trashed and deleted items are strictly blocked by _isWritableCitationItem", () => {
  globalThis.Zotero = {
    Libraries: { userLibraryID: 1, get: () => ({ editable: true }) }
  };
  const c = Object.create(Citation.prototype);
  assert.equal(c._isWritableCitationItem({ libraryID: 1, editable: true }), true);
  assert.equal(c._isWritableCitationItem({ libraryID: 1, editable: true, deleted: true }), false);
  assert.equal(c._isWritableCitationItem({ libraryID: 1, editable: true, inTrash: true }), false);
});

test("transiently missing item in citationsByItemID preserves previous valid citation text and includes all sortedItemIDs", async () => {
  globalThis.Zotero = {
    Libraries: { userLibraryID: 1 },
    Items: { get: id => ({ id, libraryID: 1, isTopLevelItem: () => true }) }
  };
  const c = Object.create(Citation.prototype);
  c.sessions = {
    S1: {
      idData: {
        "10": { plainCitation: "1: (Smith, 2024)" },
        "20": { plainCitation: "2: (Jones, 2025)" }
      }
    }
  };
  c._sessionUpdateRevision = { S1: 1 };
  c.syncCollectionItems = async () => {};
  c._invalidateSessionIndex = () => {};
  c.scheduleItemsViewRefresh = () => {};

  // Suppose item 20 is in sortedItemIDs at order 2, but transiently missing from citationsByItemID
  await c._applyCitations(
    "S1",
    { "10": [{ properties: { plainCitation: "(Smith, 2024)" } }] },
    [10, 20],
    "in-text",
    1
  );

  assert.equal(c.sessions.S1.idData["10"].plainCitation, "1: (Smith, 2024)");
  assert.equal(
    c.sessions.S1.idData["20"].plainCitation,
    "2: (Jones, 2025)",
    "Previous valid citation text for the same ordinal must be preserved when citationsByItemID transiently omits an item"
  );
});

test("closing or dead sessions do not retain stale tags in _collectActiveCitedIDSet", () => {
  globalThis.Zotero = {
    Prefs: { get: () => true },
    Integration: { sessions: { S_ALIVE: {} } }
  };
  const c = Object.create(Citation.prototype);
  c.sessions = {
    S_ALIVE: { closing: false },
    S_CLOSING: { closing: true }
  };
  c._sessionCitedIDs = {
    S_ALIVE: [101],
    S_CLOSING: [202],
    S_GHOST: [303]
  };

  const activeSet = c._collectActiveCitedIDSet();
  assert.deepEqual([...activeSet], [101], "Only live non-closing sessions must contribute to active cited tags");
});

test("Views.getCitationText resolves numeric and string item IDs consistently and rejects invalid IDs", () => {
  globalThis.Zotero = {
    ZoteroCitation: {
      api: {
        activeSessionID: "S1",
        sessionRevision: 1,
        sessions: {
          S1: {
            idData: {
              "42": { plainCitation: "1: (Einstein, 1905)" }
            }
          }
        }
      }
    },
    Integration: { currentSession: null }
  };
  const v = new Views();
  assert.equal(v.getCitationText(42), "1: (Einstein, 1905)");
  assert.equal(v.getCitationText("42"), "1: (Einstein, 1905)");
  assert.equal(v.getCitationText(-1), "");
  assert.equal(v.getCitationText("NaN"), "");
});

test("ViewsDragCite dragend strictly re-verifies that items were not trashed or invalidated during drag", async () => {
  const citedBatches = [];
  globalThis.addon = {
    data: { alive: true },
    api: { citeItems: async items => citedBatches.push(items.map(i => i.id)) }
  };
  globalThis.Zotero = {
    Prefs: { get: () => true },
    logError: () => {}
  };
  globalThis.runtime = {
    patch: () => () => {}
  };
  const listeners = new Map();
  const win = {
    document: {
      addEventListener: (t, fn) => listeners.set(t, fn),
      removeEventListener: (t) => listeners.delete(t)
    },
    ZoteroPane: {
      itemsView: { onDragStart() {} },
      getSelectedItems: () => []
    }
  };
  const v = new Views(win);
  v._resolveDropTarget = () => "word-confirmed";
  await v.dragCite();

  const item1 = { id: 10, inTrash: false, isRegularItem: () => true, isTopLevelItem: () => true };
  const item2 = { id: 20, inTrash: false, isRegularItem: () => true, isTopLevelItem: () => true };
  v._dragItems = [item1, item2];
  v._dragStartedAt = Date.now();

  // Suppose item1 was moved to Trash right before dragend completed
  item1.inTrash = true;
  listeners.get("dragend")({ dataTransfer: { mozUserCancelled: false } });

  assert.deepEqual(citedBatches, [[20]], "Item moved to trash before dragend must be excluded from citation insertion");
});

test("getSortedItemIDs and _applyCitations exclude trashed items from document ordinal calculation", async () => {
  globalThis.Zotero = {
    Libraries: { userLibraryID: 1 },
    Items: {
      get: id => id === 99
        ? { id: 99, libraryID: 1, inTrash: true, isTopLevelItem: () => true }
        : { id, libraryID: 1, inTrash: false, isTopLevelItem: () => true }
    }
  };
  const c = Object.create(Citation.prototype);
  c._sortedCacheBySession = {};
  c.debugLog = () => {};
  c._recordPerf = () => {};

  const sorted = c.getSortedItemIDs({
    "0": { citationItems: [{ id: 99 }, { id: 10 }] },
    "1": { citationItems: [{ id: 20 }] }
  }, "S1");

  assert.deepEqual(sorted, [10, 20], "Trashed item 99 must not shift active document citation ordinals");
});

test("v13.0.6 hardening: cleanupSessionState clears pending collection names, polling yields on execCommand, and active collections are protected", async () => {
  const c = Object.create(Citation.prototype);
  c._resetInternalTrackingMaps();
  c._pendingCollectionNames = new Map([["S1", "Word Citations 1"], ["S2", "Word Citations 2"]]);
  c._invalidateSessionIndex = () => {};
  c._clearCollectionRenameRetry = () => {};
  c._evictSessionSortCache = () => {};

  c.cleanupSessionState("S1", true);
  assert.equal(c._pendingCollectionNames.has("S1"), false, "cleanupSessionState must clear session entry from _pendingCollectionNames");
  assert.equal(c._pendingCollectionNames.has("S2"), true);

  // Verify _syncActiveWordSessions yields mid-loop if _isExecCommandRunning flips true
  const refreshed = [];
  c._listenerStopped = false;
  c._isExecCommandRunning = false;
  c.sessions = { S1: {}, S2: {} };
  c.ensureSession = async () => ({ collection: {} });
  c.refreshSessionCitations = async id => {
    refreshed.push(id);
    c._isExecCommandRunning = true; // Simulate native Word execCommand starting during S1 refresh
  };
  await c._syncActiveWordSessions({ S1: { agent: "WinWord" }, S2: { agent: "WinWord" } });
  assert.deepEqual(refreshed, ["S1"], "_syncActiveWordSessions must yield immediately when _isExecCommandRunning becomes true");

  // Verify _clearStaleTemporaryCollections preserves active session collection keys
  const erasedKeys = [];
  globalThis.Zotero = {
    Collections: {
      getByLibrary: () => [
        { key: "ACTIVE_KEY", loadDataType: async () => {}, getRelationsByPredicate: () => ["true"], eraseTx: async () => erasedKeys.push("ACTIVE_KEY") },
        { key: "STALE_KEY", loadDataType: async () => {}, getRelationsByPredicate: () => ["true"], eraseTx: async () => erasedKeys.push("STALE_KEY") }
      ]
    }
  };
  c.sessions = { S1: { closing: false, collection: { key: "ACTIVE_KEY" } } };
  c._temporaryCollectionKeys = new Set(["ACTIVE_KEY", "STALE_KEY"]);
  c._saveKeySet = () => {};
  await c._clearStaleTemporaryCollections(1);
  assert.deepEqual(erasedKeys, ["STALE_KEY"], "Active session collection must never be erased during stale collection cleanup");
  assert.equal(c._temporaryCollectionKeys.has("ACTIVE_KEY"), true);
});

test("preferences.css enforces 14px control typography per AGENTS.md 4.1", () => {
  const css = fs.readFileSync(path.join(root, "chrome", "content", "preferences.css"), "utf8");
  assert.match(css, /\.zoterocitation-number-row\s+label[\s\S]*?font-size:\s*14px/);
  assert.match(css, /button\s*\{[\s\S]*?font-size:\s*14px/);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const xhtml = fs.readFileSync(path.join(root, "chrome", "content", "preferences.xhtml"), "utf8");
  assert.match(xhtml, new RegExp(`class="zoterocitation-version-badge">v${pkg.version.replace(/\./g, "\\.")}<`));
});

test("Word document identification: parses Word window titles, SharePoint/OneDrive URLs, drag-cite null docId, and self-heals pending collection names", async () => {
  const c = Object.create(Citation.prototype);
  c._resetInternalTrackingMaps();
  c._invalidateSessionIndex = () => {};
  c._clearCollectionRenameRetry = () => {};
  c._scheduleCollectionRenameRetry = () => {};
  c.logError = () => {};
  c.debugLog = () => {};

  // 1. Word window title parsing & URL extraction
  assert.equal(c._getDocumentDisplayName("深度学习综述.docx - Word"), "深度学习综述.docx");
  assert.equal(c._getDocumentDisplayName("My-Paper - Part 1.docx - Saved to OneDrive - Word"), "My-Paper - Part 1.docx");
  assert.equal(c._getDocumentDisplayName("毕业论文.docx [兼容模式] - Word"), "毕业论文.docx");
  assert.equal(c._getDocumentDisplayName("毕业论文.docx - 只读 - Word (未授权产品)"), "毕业论文.docx");
  assert.equal(c._getDocumentDisplayName("毕业论文 - 已保存到此电脑 - Word"), "毕业论文");
  assert.equal(c._getDocumentDisplayName("文档1 - Word"), "文档1");
  assert.equal(c._getDocumentDisplayName("Word"), "Word");
  assert.equal(c._parseWordWindowTitle("Word"), "");
  assert.equal(c._parseWordWindowTitle("Microsoft Word"), "");
  assert.equal(
    c._getDocumentDisplayName("https://tenant.sharepoint.com/:w:/r/sites/lab/_layouts/15/Doc.aspx?sourcedoc=%7B123%7D&file=%E8%AE%BA%E6%96%87.docx&action=default"),
    "论文.docx"
  );
  assert.equal(
    c._getDocumentDisplayName("https://d.docs.live.net/123/%E8%AE%BA%E6%96%87_50%完成.docx"),
    "论文_50%完成.docx"
  );
  assert.equal(
    c._getDocumentDisplayName("https://example.test/a/part%2Fother.docx"),
    ""
  );

  // 2. Drag-cite (docId = null) resolves dropped Word window title and creates collection with real document name
  globalThis.addon = {
    data: {
      alive: true,
      lastDroppedWordWindow: { title: "综述初稿.docx - 已保存 - Word", at: Date.now() },
      probeWordWindowTitles: () => ({ foregroundTitle: "", visibleTitles: [] })
    }
  };
  const resolvedFromDrop = c._resolveFallbackDocumentId("S1", {}, null, true);
  assert.equal(c._getDocumentDisplayName(resolvedFromDrop), "综述初稿.docx");
  assert.equal(globalThis.addon.data.lastDroppedWordWindow, undefined, "lastDroppedWordWindow must be consumed once");

  // 3. Background self-healing of "Word 文档（待识别） 1" -> "文档1" -> "正式定稿.docx"
  const pendingName = c._getPendingCollectionName("S1");
  const mockCollection = { id: 1, key: "K1", name: pendingName, saveTx: async () => {} };
  c.sessions = { S1: { collection: mockCollection, idData: {} } };
  globalThis.addon.data.probeWordWindowTitles = () => ({
    foregroundTitle: "",
    visibleTitles: ["文档1 - Word"]
  });

  await c._syncSessionDocumentName("S1", { agent: "WinWord" }, c.sessions.S1);
  assert.equal(mockCollection.name, "文档1", "Pending collection must self-heal from unambiguous Word window title");

  // Simulate user pressing Ctrl+S in Word to save "文档1" as "正式定稿.docx"
  globalThis.addon.data.probeWordWindowTitles = () => ({
    foregroundTitle: "",
    visibleTitles: ["正式定稿.docx - 已保存到此电脑 - Word"]
  });
  await c._syncSessionDocumentName("S1", { agent: "WinWord" }, c.sessions.S1);
  assert.equal(mockCollection.name, "正式定稿.docx", "Collection must automatically update when unsaved Word document is saved");

  // 4. Ambiguous multiple unidentified Word windows must not guess in background polling
  const pendingName2 = c._getPendingCollectionName("S2");
  const mockCollection2 = { id: 2, key: "K2", name: pendingName2, saveTx: async () => {} };
  c.sessions = {
    S2: { collection: mockCollection2, idData: {} },
    S3: { collection: { id: 3, key: "K3", name: c._getPendingCollectionName("S3"), saveTx: async () => {} }, idData: {} }
  };
  globalThis.addon.data.probeWordWindowTitles = () => ({
    foregroundTitle: "",
    visibleTitles: ["A.docx - Word", "B.docx - Word"]
  });
  await c._syncSessionDocumentName("S2", { agent: "WinWord" }, c.sessions.S2);
  assert.equal(mockCollection2.name, pendingName2, "Must not guess when multiple unidentified sessions and multiple Word windows exist");
});

test("ViewsIconPatch positions CiteFlow Word collections immediately above My Publications regardless of locale collation", async () => {
  const { ViewsIconPatch } = await import("../src/modules/views/icon-patch.ts");
  const { ViewsSessionIndex } = await import("../src/modules/views/session-index.ts");
  const { NativeRuntime } = await import("../src/runtime.ts");

  const makeRow = (type, id, level, ref = null) => ({
    type,
    id,
    level,
    ref,
    isLibrary: (includeGroups) => type === "library" || (includeGroups && type === "group"),
    isCollection: () => type === "collection",
    isSearch: () => type === "search",
    isPublications: () => type === "publications",
    isDuplicates: () => type === "duplicates",
    isUnfiled: () => type === "unfiled",
    isRetracted: () => type === "retracted",
    isTrash: () => type === "trash"
  });

  const wordCol = {
    id: 901,
    key: "WORD_CN",
    libraryID: 1,
    name: "新建 Microsoft Word 文档.docx",
    _isCiteFlowCollection: true
  };

  // Simulate zh-CN localeCompare ordering where "新建..." sorts between "06_Reference Shelf" and "Daily Folder"
  const rows = [
    makeRow("library", "L1", 0, { libraryID: 1 }),
    makeRow("collection", "C1", 1, { id: 1, key: "K1", libraryID: 1, name: "05_Archive" }),
    makeRow("collection", "C2", 1, { id: 2, key: "K2", libraryID: 1, name: "06_Reference Shelf" }),
    makeRow("collection", "C901", 1, wordCol),
    makeRow("collection", "C3", 1, { id: 3, key: "K3", libraryID: 1, name: "Daily Folder" }),
    makeRow("collection", "C31", 2, { id: 31, key: "K31", libraryID: 1, name: "2026" }),
    makeRow("collection", "C311", 3, { id: 311, key: "K311", libraryID: 1, name: "2026-10" }),
    makeRow("collection", "C4", 1, { id: 4, key: "K4", libraryID: 1, name: "HNU" }),
    makeRow("collection", "C5", 1, { id: 5, key: "K5", libraryID: 1, name: "Syllabus Tour" }),
    makeRow("publications", "P1", 1),
    makeRow("duplicates", "D1", 1),
    makeRow("unfiled", "U1", 1),
    makeRow("trash", "T1", 1)
  ];

  let invalidated = 0;
  const cv = {
    _rows: rows,
    _rowMap: {},
    selection: { focused: 3, pivot: 3, selected: new Set([3]) },
    isContainerOpen: () => true,
    isContainerEmpty: () => false,
    getLevel: (idx) => cv._rows[idx]?.level ?? 0,
    getRow: (idx) => cv._rows[idx],
    _refreshRowMap() {
      this._rowMap = {};
      this._rows.forEach((r, idx) => { this._rowMap[r.id] = idx; });
    },
    _addRow(treeRow, beforeRow) {
      this._rows.splice(beforeRow, 0, treeRow);
      this._refreshRowMap();
    },
    renderItem: () => null,
    _expandRow: async () => 0,
    _addSortedRow: async function(objectType, id) {
      const col = globalThis.Zotero.Collections.get(id);
      const startRow = this._rowMap["L" + col.libraryID];
      const level = this.getLevel(startRow) + 1;
      let beforeRow = startRow + 1;
      for (let i = startRow + 1; i < this._rows.length; i++) {
        if (this.getLevel(i) === level) {
          const r = this.getRow(i);
          if (!r.isCollection()) {
            beforeRow = i;
            break;
          }
          if (String(r.ref.name).localeCompare(String(col.name)) > 0) {
            beforeRow = i;
            break;
          }
        }
        beforeRow = i + 1;
      }
      this._addRow(makeRow("collection", `C${col.id}`, level, col), beforeRow);
      return beforeRow;
    },
    tree: { invalidate: () => { invalidated += 1; } }
  };
  cv._refreshRowMap();

  globalThis.runtime = new NativeRuntime();
  globalThis.addon = { data: { alive: true, citation: { _temporaryCollectionKeys: new Set(["WORD_CN"]) } } };
  globalThis.Zotero = {
    localeCompare: (a, b) => String(a).localeCompare(String(b), "zh-CN"),
    CollectionTreeRow: function(_view, type, ref, level) {
      return makeRow(type, `C${ref.id}`, level, ref);
    },
    Collections: {
      _map: new Map(),
      get(id) { return this._map.get(id); }
    },
    ZoteroCitation: { api: { sessions: {}, sessionRevision: 1 } }
  };

  const view = Object.assign(Object.create(ViewsIconPatch.prototype), ViewsSessionIndex.prototype, {
    pane: { collectionsView: cv },
    _disposed: false,
    _patchDisposers: []
  });

  await view.patchIcon();

  const pubIdx = cv._rows.findIndex(r => r.type === "publications");
  const wordIdx = cv._rows.findIndex(r => r.id === "C901");
  assert.equal(wordIdx, pubIdx - 1, "Word collection must sit immediately above My Publications");
  assert.equal(cv._rows[wordIdx - 1].ref?.name, "Syllabus Tour", "Syllabus Tour must precede Word collection");
  assert.equal(cv.selection.focused, wordIdx, "Selection focus must follow the repositioned Word collection row");
  assert.ok(cv.selection.selected.has(wordIdx), "Selected row index set must update to match new row position");
  assert.ok(invalidated >= 1, "Tree must invalidate after repositioning");

  // Adding a regular user collection "Z_Notes" via _addSortedRow must insert BEFORE Word collections
  const zNotes = { id: 6, key: "K6", libraryID: 1, name: "Z_Notes" };
  globalThis.Zotero.Collections._map.set(6, zNotes);
  await cv._addSortedRow("collection", 6);

  const newWordIdx = cv._rows.findIndex(r => r.id === "C901");
  const zNotesIdx = cv._rows.findIndex(r => r.id === "C6");
  const newPubIdx = cv._rows.findIndex(r => r.type === "publications");
  assert.equal(zNotesIdx, newWordIdx - 1, "Regular collection Z_Notes must be inserted above CiteFlow Word collection");
  assert.equal(newWordIdx, newPubIdx - 1, "CiteFlow Word collection must remain immediately above My Publications");

  for (const dispose of view._patchDisposers) dispose();
});

test("CitationFormatting._formatItemPlainCitation purges zero-width controls and deduplicates repeated identical citations", async () => {
  const { CitationFormatting } = await import("../src/modules/citation/formatting.ts");
  const instance = Object.create(CitationFormatting.prototype);

  const idIndexMap = new Map([[101, 0]]);
  const citationsByItemID = {
    101: [
      { properties: { plainCitation: "\u200B(Smith et al., 2020)\uFEFF" } },
      { properties: { plainCitation: "(Smith et al., 2020)" } },
      { properties: { plainCitation: "  (Smith et al., 2020)  " } },
      { properties: { plainCitation: "(Smith et al., 2020, p. 45)" } }
    ]
  };

  const formatted = instance._formatItemPlainCitation(101, idIndexMap, citationsByItemID, {}, false);
  assert.equal(formatted, "1: (Smith et al., 2020), (Smith et al., 2020, p. 45)",
    "Identical repeated citations within the same item must be cleanly deduplicated and zero-width characters stripped");
});

test("v13.0.12: direct citeItems in src/modules/cite.ts blocks trashed/deleted items and resolves multi-window Zotero_Tabs", async () => {
  const { citeItems } = await import("../src/modules/cite.ts");
  const hooks = (await import("../src/hooks.ts")).default;

  globalThis.addon = { data: { alive: true } };
  globalThis.Zotero = {
    Integration: {
      Session: class {
        cite() {}
      },
      execCommand: async () => {}
    }
  };
  globalThis.Zotero.Integration.Session.prototype.cite = function() {};

  // 1. Deleted or trashed items are rejected directly by citeItems() in cite.ts
  let execCalled = false;
  globalThis.Zotero.Integration.execCommand = async () => { execCalled = true; };

  await citeItems([
    { id: 10, deleted: true, inTrash: false, isRegularItem: () => true, isTopLevelItem: () => true }
  ]);
  assert.equal(execCalled, false, "Deleted item must be blocked directly by src/modules/cite.ts");

  await citeItems([
    { id: 11, deleted: false, inTrash: true, isRegularItem: () => true, isTopLevelItem: () => true }
  ]);
  assert.equal(execCalled, false, "Trashed item must be blocked directly by src/modules/cite.ts");

  // 2. Multi-window unload rebinds globalThis.window / Zotero_Tabs to remaining open window
  const win1 = {
    closed: false,
    document: { id: "doc1" },
    ZoteroPane: { getSelectedItems: () => [{ id: 101, deleted: false, inTrash: false, isRegularItem: () => true, isTopLevelItem: () => true }] },
    Zotero_Tabs: { selectedIndex: 0 }
  };
  const win2 = {
    closed: false,
    document: { id: "doc2" },
    ZoteroPane: { getSelectedItems: () => [{ id: 202, deleted: false, inTrash: false, isRegularItem: () => true, isTopLevelItem: () => true }] },
    Zotero_Tabs: { selectedIndex: 0 }
  };
  globalThis.window = win1;
  globalThis.document = win1.document;
  globalThis.ZoteroPane = win1.ZoteroPane;
  globalThis.Zotero_Tabs = win1.Zotero_Tabs;
  globalThis.Zotero.getMainWindows = () => [win1, win2];
  globalThis.Zotero.getMainWindow = () => win2;

  hooks.onMainWindowUnload(win1);
  assert.equal(globalThis.window, win2, "Unloading win1 must rebind globalThis.window to remaining open win2");
  assert.equal(globalThis.Zotero_Tabs, win2.Zotero_Tabs, "Unloading win1 must rebind globalThis.Zotero_Tabs to win2");

  // Even if globalThis.Zotero_Tabs is cleared, citeItems() resolves via Zotero.getMainWindow() without throwing
  globalThis.Zotero_Tabs = undefined;
  globalThis.ZoteroPane = undefined;
  await citeItems();
  assert.equal(execCalled, true, "citeItems() must succeed via Zotero.getMainWindow() when globalThis.Zotero_Tabs is undefined");
});

test("v13.0.12: preferences-sync awaits collection erasure, retains key on eraseTx error, and populates existing items on re-enable", async () => {
  const { CitationPreferences } = await import("../src/modules/citation/preferences-sync.ts");
  const c = Object.create(CitationPreferences.prototype);
  c.logError = () => {};
  c._getCitationTagName = () => "/Citations";
  c._getBoolPref = () => false;
  c._getClampedIntPref = (k, def) => def;
  c._invalidateSessionIndex = () => { invalidatedCount += 1; };

  let erased = false;
  let staleCleared = false;
  let invalidatedCount = 0;
  let savedKeys = null;
  c.clearStaleArtifacts = async () => { staleCleared = true; };
  c._saveKeySet = (_pref, keys) => { savedKeys = new Set(keys); };

  const mockCollection = {
    key: "COL_KEY_123",
    eraseTx: async () => { erased = true; }
  };

  c.sessions = {
    S1: { closing: false, collection: mockCollection, idData: { "10": {}, "20": {} } }
  };
  c._temporaryCollectionKeys = new Set(["COL_KEY_123"]);
  c._collectionsEnabled = true;

  let prefEnabled = false;
  globalThis.Zotero = {
    Prefs: {
      get: (k) => {
        if (k.endsWith("collections.enable")) return prefEnabled;
        if (k.endsWith("citationTags.enable")) return true;
        return null;
      }
    }
  };

  // 1. Disabling collections erases collection, removes key, and clears stale artifacts
  await c.applyPreferences();
  assert.equal(erased, true, "Collection must be erased via eraseTx()");
  assert.equal(c.sessions.S1.collection, undefined, "session.collection must be deleted");
  assert.equal(c._temporaryCollectionKeys.has("COL_KEY_123"), false, "Collection key must be removed from _temporaryCollectionKeys");
  assert.equal(savedKeys?.has("COL_KEY_123"), false, "Saved keys must not contain erased key");
  assert.equal(staleCleared, true, "clearStaleArtifacts must be called");

  // 2. Re-enabling collections initializes collection and immediately populates existing session.idData items
  prefEnabled = true;
  let syncedIDs = null;
  c.initCollection = async (_id, session) => {
    session.collection = { key: "COL_KEY_NEW" };
  };
  c.syncCollectionItems = async (_session, ids) => {
    syncedIDs = ids;
  };
  await c.applyPreferences();
  assert.equal(c.sessions.S1.collection?.key, "COL_KEY_NEW");
  assert.deepEqual(syncedIDs, [10, 20], "Re-enabling collections must immediately populate existing session items");
});

test("v13.0.11: preferences.xhtml only opens first accordion card and preferences.css keeps top description flush", () => {
  const xhtml = fs.readFileSync(path.join(root, "chrome", "content", "preferences.xhtml"), "utf8");
  const openCards = [...xhtml.matchAll(/class="zoterocitation-setting-card"\s+open="open"/g)];
  assert.equal(openCards.length, 1, "Only the first group card must be open by default per AGENTS.md 4.1");

  const css = fs.readFileSync(path.join(root, "chrome", "content", "preferences.css"), "utf8");
  assert.match(css, /\.zoterocitation-setting-content\s*>\s*\.zoterocitation-description:first-child[\s\S]*?margin:\s*2px\s+0\s+10px\s+0;/,
    "Level 1 top overview description must remain flush with the 16px content line");
});

test("v13.0.13 data pipeline: collections.enable=false independence, all-trashed document clearing, polluted key filtering, trashed tag complete status, and closing session exclusion", async () => {
  const c = Object.create(Citation.prototype);
  c._initSessionTracking();
  c._resetInternalTrackingMaps();
  c._minRefreshInterval = 0;
  c.logError = () => {};
  c.debugLog = () => {};
  c._recordPerf = () => {};
  c._bumpDebugCounter = () => {};
  c._saveManagedTagIDs = () => true;
  c._invalidateSessionIndex = () => {};
  c.scheduleItemsViewRefresh = () => {};
  c._isPendingCollectionName = () => true;
  c._getPendingCollectionName = () => "Pending 1";
  c._resolveFallbackDocumentId = () => "C:\\Docs\\Paper.docx";

  // 1. When collections.enable = false, ensureSession & _syncActiveWordSessions still refresh citations and tags
  let collectionsEnabled = false;
  globalThis.Zotero = {
    Prefs: {
      get: (k) => {
        if (k.endsWith("collections.enable")) return collectionsEnabled;
        if (k.endsWith("citationTags.enable")) return true;
        return true;
      }
    },
    Libraries: { userLibraryID: 1, get: () => ({ editable: true }) },
    Items: {
      get: (id) => ({
        id,
        libraryID: 1,
        editable: true,
        deleted: false,
        inTrash: false,
        isTopLevelItem: () => true
      })
    },
    Integration: {
      sessions: {
        S1: {
          agent: "WinWord",
          styleClass: "in-text",
          citationsByIndex: { "0": { citationItems: [{ id: 10 }] } },
          citationsByItemID: { "10": [{ properties: { plainCitation: "(Alpha, 2026)" } }] }
        }
      }
    }
  };

  await c._syncActiveWordSessions(globalThis.Zotero.Integration.sessions);
  assert.equal(c.sessions.S1?.collection, undefined, "No collection should be created when collections.enable is false");
  assert.equal(c.sessions.S1?.docId, "C:\\Docs\\Paper.docx", "Document ID must still be resolved and remembered when collections are disabled");
  assert.equal(c.sessions.S1?.idData?.["10"]?.plainCitation, "1: (Alpha, 2026)", "Citation column data must still update when collections.enable is false");
  assert.deepEqual(c._sessionCitedIDs.S1, [10], "Citation tag tracking must still update when collections.enable is false");

  // 2. Polluted keys in citationsByItemID are rejected by _applyCitations
  c._sessionUpdateRevision.S1 = 99;
  await c._applyCitations(
    "S1",
    {
      "10": [{ properties: { plainCitation: "(Alpha, 2026)" } }],
      "NaN": [{ properties: { plainCitation: "bad" } }],
      "-1": [{ properties: { plainCitation: "bad" } }],
      "0": [{ properties: { plainCitation: "bad" } }],
      "__meta__": [{ properties: { plainCitation: "bad" } }]
    },
    [10],
    "in-text",
    99
  );
  assert.deepEqual(Object.keys(c.sessions.S1.idData), ["10"], "Polluted non-positive-integer keys in citationsByItemID must be rejected");

  // 3. When all cited items in a Word document are moved to Zotero Trash, refreshSessionCitations clears idData and _sessionCitedIDs
  globalThis.Zotero.Items.get = (id) => ({
    id,
    libraryID: 1,
    editable: true,
    deleted: false,
    inTrash: true,
    isTopLevelItem: () => true
  });
  c._minRefreshInterval = 0;
  c._lastRefreshAt = {};
  await c.refreshSessionCitations("S1", globalThis.Zotero.Integration.sessions.S1);
  assert.deepEqual(c.sessions.S1.idData, {}, "All-trashed document must clear stale citation column entries");
  assert.equal(c._sessionCitedIDs.S1, undefined, "All-trashed document must clear active session cited IDs");

  // 4. Trashed item with a previously managed tag is protected from writes AND does not cause syncCitationTags to return complete: false
  c._managedCitationTagIDs = { 10: true };
  c._managedCitationTagNames = { 10: "/Citations" };
  c._citationTagName = "/Citations";
  const tagRes = await c.syncCitationTags("S1", []);
  assert.equal(tagRes.complete, true, "Trashed item must not cause syncCitationTags to report complete: false");
  assert.equal(c._managedCitationTagIDs[10], true, "Managed tag record is retained in case item is restored from Trash");

  // 5. ViewsSessionIndex skips closing sessions
  globalThis.Zotero.ZoteroCitation = {
    api: {
      activeSessionID: "S_CLOSING",
      sessionRevision: 5,
      sessions: {
        S_CLOSING: { closing: true, idData: { "10": { plainCitation: "1: Stale" } } },
        S_OPEN: { closing: false, idData: { "10": { plainCitation: "1: Live" } } }
      }
    }
  };
  const v = new Views();
  assert.equal(v.getCitationText(10), "1: Live", "Closing session must be ignored by ViewsSessionIndex");
});

test("v13.2.1 execution logic: initCollection mid-flight abort, foreground title anti-theft, post-command unthrottled refresh, and empty snapshot cache eviction", async () => {
  const c = Object.create(Citation.prototype);
  c._initSessionTracking();
  c._resetInternalTrackingMaps();
  c.logError = () => {};
  c.debugLog = () => {};
  c._recordPerf = () => {};
  c._bumpDebugCounter = () => {};
  c._saveManagedTagIDs = () => true;
  c._saveKeySet = () => {};
  c._invalidateSessionIndex = () => {};
  c.scheduleItemsViewRefresh = () => {};
  c._getPendingCollectionName = () => "Pending 1";

  // 1. initCollection aborts and erases collection if session.closing flips true during saveTx()
  let erasedMidFlight = false;
  globalThis.Zotero = {
    Prefs: { get: () => true },
    Libraries: { userLibraryID: 1 },
    Collection: class {
      constructor() {
        this.key = "MID_FLIGHT_KEY";
        this.id = 777;
      }
      addRelation() {}
      async saveTx() {
        c.sessions.S_RACE.closing = true;
      }
      async eraseTx() {
        erasedMidFlight = true;
      }
    }
  };
  c._temporaryCollectionKeys = new Set();
  c.sessions.S_RACE = { closing: false, idData: {} };
  await c.initCollection("S_RACE", c.sessions.S_RACE);
  assert.equal(erasedMidFlight, true, "initCollection must erase collection if session.closing flips true during saveTx");
  assert.equal(c.sessions.S_RACE.collection, undefined, "Closing session must not retain mid-flight collection");
  assert.equal(c._temporaryCollectionKeys.has("MID_FLIGHT_KEY"), false);

  // 2. Foreground title anti-theft: unidentified S2 must not steal foreground title already claimed by S1
  c.sessions = {
    S1: { closing: false, docId: "C:\\Work\\Claimed.docx" },
    S2: { closing: false }
  };
  c._docIdBySession = { S1: "C:\\Work\\Claimed.docx" };
  globalThis.addon = {
    data: {
      alive: true,
      probeWordWindowTitles: () => ({
        foregroundTitle: "Claimed.docx - Word",
        visibleTitles: ["Claimed.docx - Word", "Unclaimed.docx - Word"]
      })
    }
  };
  const resolvedForS2 = c._resolveFallbackDocumentId("S2", {}, null, true);
  assert.equal(c._getDocumentDisplayName(resolvedForS2), "Unclaimed.docx",
    "Unidentified S2 must skip foreground title already claimed by S1 and pick the sole unclaimed visible document");

  // 3. _handleEmptyCitationSnapshot evicts _sortedCacheBySession upon 2nd empty confirmation
  c._setSortedCache("S1", "0:10;", [10]);
  assert.ok(c._getSortedCache("S1"), "Precondition: sort cache exists for S1");
  c.scheduleCitationTagSync = () => {};
  c.updateCitations = async () => {};
  c._scheduleSessionRefresh = () => {};
  await c._handleEmptyCitationSnapshot("S1", { styleClass: "in-text" }, {});
  assert.ok(c._getSortedCache("S1"), "First empty read must not evict sort cache yet");
  await c._handleEmptyCitationSnapshot("S1", { styleClass: "in-text" }, {});
  assert.equal(c._getSortedCache("S1"), undefined, "Second confirmed empty read must evict stale sort cache");

  // 4. _handlePostExecCommand resets _lastRefreshAt so post-command refresh is never throttled by background poll
  let refreshedImmediately = false;
  c._minRefreshInterval = 60000;
  c._lastRefreshAt.S1 = Date.now();
  c.ensureSession = async () => ({ collection: { name: "Claimed.docx" }, pending: false });
  c.refreshSessionCitations = async (sid) => {
    if (!c._lastRefreshAt[sid]) refreshedImmediately = true;
  };
  globalThis.Zotero.Integration = {
    sessions: { S1: { agent: "WinWord" } }
  };
  await c._handlePostExecCommand({ bindingID: 1, sessionID: "S1", ambiguous: false }, null, () => {}, "C:\\Work\\Claimed.docx");
  assert.equal(refreshedImmediately, true, "Post-command refresh must clear _lastRefreshAt and execute unthrottled");

  // 5. Card 4 primary number rows align at 0px (16px content line) while Card 3 subordinate row aligns at 24px (40px golden line)
  const css = fs.readFileSync(path.join(root, "chrome", "content", "preferences.css"), "utf8");
  assert.match(css, /\.zoterocitation-number-row\s*\{[\s\S]*?margin-inline-start:\s*0;/);
  assert.match(css, /\.zoterocitation-number-row\.zoterocitation-subordinate-row\s*\{[\s\S]*?margin-inline-start:\s*24px;/);
});

test("v16.1.0 round-2 edge cases: icon-patch own isCollection restore, preferences-sync mid-flight abort, formatting post-close timer guard, and word-integration existing session preservation", async () => {
  const prevZotero = globalThis.Zotero;
  const prevAddon = globalThis.addon;
  const prevRuntime = globalThis.runtime;
  try {
    // 1. ViewsIconPatch._addSortedRow restores own isCollection instead of deleting it, while removing prototype shadow masks
    const { ViewsIconPatch } = await import("../src/modules/views/icon-patch.ts");
    const protoRow = Object.create({ isCollection() { return true; } });
    protoRow.ref = { _isCiteFlowCollection: true, key: "PROTO_CITE" };
    const ownIsCollection = function() { return true; };
    const ownRow = { isCollection: ownIsCollection, ref: { _isCiteFlowCollection: true, key: "OWN_CITE" } };
    const normalRow = { isCollection() { return true; }, ref: { key: "REGULAR" } };
    let maskedDuringOriginal = null;
    const cv = {
      _rows: [protoRow, ownRow, normalRow],
      getRow: (i) => cv._rows[i],
      renderItem: () => null,
      _addSortedRow: async () => {
        maskedDuringOriginal = [protoRow.isCollection(), ownRow.isCollection(), normalRow.isCollection()];
        return true;
      }
    };
    globalThis.Zotero = { Collections: { get: () => ({ id: 999, key: "REGULAR" }) } };
    globalThis.addon = { data: { alive: true } };
    globalThis.runtime = {
      log() {},
      patch(owner, key, _name, create) {
        const prev = owner[key];
        owner[key] = create(prev);
        return () => { owner[key] = prev; };
      }
    };
    const iconView = Object.create(ViewsIconPatch.prototype);
    iconView._disposed = false;
    iconView._patchDisposers = [];
    iconView.pane = { collectionsView: cv };
    iconView.repositionCitationCollections = () => true;
    await iconView.patchIcon();
    await cv._addSortedRow("collection", 999);
    assert.deepEqual(maskedDuringOriginal, [false, false, true], "Only CiteFlow citation rows should be masked during _addSortedRow");
    assert.equal(Object.hasOwn(protoRow, "isCollection"), false, "Prototype-inherited row must have temporary own shadow removed");
    assert.equal(protoRow.isCollection(), true);
    assert.equal(Object.hasOwn(ownRow, "isCollection"), true, "Row with own isCollection must retain own property");
    assert.equal(ownRow.isCollection, ownIsCollection, "Own isCollection method must be restored verbatim");
    assert.equal(ownRow.isCollection(), true);

    // 2. preferences-sync aborts cleanly mid-flight if collections toggle OFF or session closes during await initCollection
    const { CitationPreferences } = await import("../src/modules/citation/preferences-sync.ts");
    const p = Object.create(CitationPreferences.prototype);
    p.logError = () => {};
    p._getCitationTagName = () => "/Citations";
    p._getBoolPref = () => false;
    p._getClampedIntPref = (_k, def) => def;
    p._invalidateSessionIndex = () => {};
    p._listenerStopped = false;
    p._collectionsEnabled = false;
    let prefColsEnabled = true;
    let initCalls = [];
    let syncedSessions = [];
    p.sessions = {
      S1: { closing: false, idData: { "10": {} } },
      S2: { closing: false, idData: { "20": {} } }
    };
    globalThis.Zotero = {
      Prefs: { get: (k) => (k.endsWith("collections.enable") ? prefColsEnabled : true) },
      Integration: { sessions: { S1: {}, S2: {} } },
      Libraries: { userLibraryID: 1 }
    };
    p.initCollection = async (id, s) => {
      initCalls.push(id);
      s.collection = { key: `K_${id}` };
      prefColsEnabled = false;
      p._collectionsEnabled = false;
    };
    p.refreshSessionCitations = async () => { syncedSessions.push("refresh"); };
    p.syncCollectionItems = async (s) => { syncedSessions.push(s.collection?.key); };
    await p.applyPreferences();
    assert.deepEqual(initCalls, ["S1"], "Toggle off mid-flight must stop loop before initializing S2");
    assert.deepEqual(syncedSessions, [], "Toggle off mid-flight must not invoke post-init sync on S1");

    // 3. formatting._scheduleSessionRefresh & _refreshSessionCitations ignore closed/removed sessions
    const c = Object.create(Citation.prototype);
    c._initSessionTracking();
    c._resetInternalTrackingMaps();
    c._minRefreshInterval = 50;
    c.logError = () => {};
    c.debugLog = () => {};
    c._recordPerf = () => {};
    c._bumpDebugCounter = () => {};
    c._saveManagedTagIDs = () => true;
    c.scheduleCitationTagSync = () => {};
    c.updateCitations = async () => {};
    c.sessions.S_CLOSED = { closing: true, idData: {} };
    c._scheduleSessionRefresh("S_CLOSED", {}, 100);
    assert.equal(c._refreshRetryTimerBySession.S_CLOSED, undefined, "Closing session must never schedule a retry timer");
    const nativeTarget = { styleClass: "in-text" };
    c.sessions.S_RACE = { closing: false, idData: {} };
    let resolveRead;
    c._readSessionCitationSnapshots = () => new Promise(r => { resolveRead = r; });
    const inFlightRefresh = c.refreshSessionCitations("S_RACE", nativeTarget);
    await new Promise(r => setImmediate(r));
    await c.refreshSessionCitations("S_RACE", nativeTarget); // sets refreshState.pending = true
    c.sessions.S_RACE.closing = true;
    delete c.sessions.S_RACE;
    resolveRead({ citationsByItemID: {}, citationsByIndex: {}, transientMismatch: false });
    await inFlightRefresh;
    assert.equal(c._refreshRetryTimerBySession.S_RACE, undefined, "Pending refresh must not schedule a timer after session close");

    // 4. ensureSession sets pending=true on existing session and preserves existing idData when initCollection fails
    const existingSession = { idData: { "42": { plainCitation: "1: Keep" } }, pending: false };
    c.sessions = { S_EXIST: existingSession };
    c._listenerStopped = false;
    c._invalidateSessionIndex = () => {};
    c._getPendingCollectionName = () => "Pending";
    c._getDocumentDisplayName = () => "";
    c._extractSessionDocumentId = () => undefined;
    let observedPendingDuringInit = false;
    c.initCollection = async (_id, s) => {
      observedPendingDuringInit = s.pending === true;
      throw new Error("db locked");
    };
    globalThis.Zotero = { Prefs: { get: () => true }, Integration: { sessions: { S_EXIST: {} } } };
    await assert.rejects(c.ensureSession("S_EXIST", { styleClass: "in-text" }), /db locked/);
    assert.equal(observedPendingDuringInit, true, "Existing session entering initCollection must mark pending=true");
    assert.equal(c.sessions.S_EXIST, existingSession, "Existing session object must remain tracked after transient collection init failure");
    assert.equal(c.sessions.S_EXIST.idData["42"]?.plainCitation, "1: Keep");
    assert.equal(c.sessions.S_EXIST.pending, false, "pending flag must clear in finally");
  } finally {
    if (prevZotero === undefined) delete globalThis.Zotero; else globalThis.Zotero = prevZotero;
    if (prevAddon === undefined) delete globalThis.addon; else globalThis.addon = prevAddon;
    if (prevRuntime === undefined) delete globalThis.runtime; else globalThis.runtime = prevRuntime;
  }
});
