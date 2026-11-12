import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { Citation } from "../src/modules/citation.ts";
import { updateSessionCitationsIfDirty } from "../src/modules/citation/refresh-helpers.ts";
import { verifyDroppedWordTarget } from "../src/modules/drop-target.ts";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function createLiveCitation() {
  const c = Object.create(Citation.prototype);
  c._initSessionTracking();
  c._initDiagnosticsAndTelemetry();
  c._initWordIntegrationState();
  c._initTimersAndDebounce();
  c._resetInternalTrackingMaps();
  c._collectionsEnabled = true;
  c._citationTagsEnabled = true;
  c._citationTagName = "/Citations";
  c._tagSyncDebounceMs = 5;
  c._itemsViewRefreshDebounceMs = 5;
  c.logError = () => {};
  c.debugLog = () => {};
  c._recordPerf = () => {};
  c._bumpDebugCounter = () => {};
  c._invalidateSessionIndex = () => {};
  c._saveManagedTagIDs = () => true;
  return c;
}

test("P1: tag sync failure prevents caching session fingerprint and retries unchanged citations", async () => {
  const prevZotero = globalThis.Zotero;
  try {
    let failSave = true;
    const tags = new Set();
    const items = {
      10: {
        id: 10,
        libraryID: 1,
        deleted: false,
        inTrash: false,
        isTopLevelItem: () => true,
        isEditable: () => true,
        hasTag: (name) => tags.has(name),
        addTag: (name) => tags.add(name),
        removeTag: (name) => tags.delete(name),
        saveTx: async () => {
          if (failSave) throw new Error("tag saveTx failed");
        }
      }
    };
    const refreshCalls = [];
    globalThis.Zotero = {
      Prefs: { get: () => true },
      Libraries: { userLibraryID: 1, get: () => ({ editable: true }) },
      Items: { get: (id) => items[id] || null },
      Promise: { delay: async () => {} },
      Integration: { sessions: {} },
      getMainWindows: () => [{ ZoteroPane: { itemsView: { refreshAndMaintainSelection: async () => { refreshCalls.push(1); } } } }]
    };

    const c = createLiveCitation();
    const sessionObj = { collection: { id: 1, key: "COL1", libraryID: 1 }, idData: {} };
    c.sessions = { S1: sessionObj };
    c.syncCollectionItems = async () => true;
    const native = {
      styleClass: "in-text",
      citationsByItemID: { 10: [{ properties: { plainCitation: "Smith, 2024" } }] },
      citationsByIndex: { 0: { citationItems: [{ id: 10 }] } }
    };

    let updateCalls = 0;
    const origUpdate = c.updateCitations.bind(c);
    c.updateCitations = async (...args) => {
      updateCalls++;
      return origUpdate(...args);
    };

    await updateSessionCitationsIfDirty(c, "S1", native, [10], native.citationsByItemID);
    await new Promise(r => setTimeout(r, 40));
    assert.equal(updateCalls, 1);
    assert.equal(c._lastRefreshFingerprintBySession.has(sessionObj), false, "failed tag sync must not commit fingerprint");
    assert.equal(c._lastSyncFailedBySession.get(sessionObj), true);

    // Next poll with identical Word citations must retry and succeed once saveTx recovers
    failSave = false;
    await updateSessionCitationsIfDirty(c, "S1", native, [10], native.citationsByItemID);
    await new Promise(r => setTimeout(r, 40));
    assert.equal(updateCalls, 2);
    assert.equal(tags.has("/Citations"), true);
    assert.equal(c._lastRefreshFingerprintBySession.has(sessionObj), true, "fingerprint commits after tag & view sync succeed");

    // Subsequent unchanged idle poll now skips cleanly
    await updateSessionCitationsIfDirty(c, "S1", native, [10], native.citationsByItemID);
    assert.equal(updateCalls, 2);
  } finally {
    if (prevZotero === undefined) delete globalThis.Zotero; else globalThis.Zotero = prevZotero;
  }
});

test("P1: ItemTree view refresh failure prevents fingerprint caching and retries list invalidation", async () => {
  const prevZotero = globalThis.Zotero;
  try {
    let failViewRefresh = true;
    let viewRefreshes = 0;
    const items = {
      10: {
        id: 10,
        libraryID: 1,
        deleted: false,
        inTrash: false,
        isTopLevelItem: () => true,
        isEditable: () => true,
        hasTag: () => true,
        addTag: () => {},
        removeTag: () => {},
        saveTx: async () => {}
      }
    };
    globalThis.Zotero = {
      Prefs: { get: () => true },
      Libraries: { userLibraryID: 1, get: () => ({ editable: true }) },
      Items: { get: (id) => items[id] || null },
      Promise: { delay: async () => {} },
      Integration: { sessions: {} },
      getMainWindows: () => [{
        ZoteroPane: {
          itemsView: {
            refreshAndMaintainSelection: async () => {
              if (failViewRefresh) throw new Error("tree refresh failed");
              viewRefreshes++;
            }
          }
        }
      }]
    };

    const c = createLiveCitation();
    const sessionObj = { collection: { id: 1, key: "COL1", libraryID: 1 }, idData: {} };
    c.sessions = { S1: sessionObj };
    c.syncCollectionItems = async () => true;
    const native = {
      styleClass: "in-text",
      citationsByItemID: { 10: [{ properties: { plainCitation: "Smith, 2024" } }] },
      citationsByIndex: { 0: { citationItems: [{ id: 10 }] } }
    };

    let updateCalls = 0;
    const origUpdate = c.updateCitations.bind(c);
    c.updateCitations = async (...args) => {
      updateCalls++;
      return origUpdate(...args);
    };

    await updateSessionCitationsIfDirty(c, "S1", native, [10], native.citationsByItemID);
    await new Promise(r => setTimeout(r, 40));
    assert.equal(updateCalls, 1);
    assert.equal(viewRefreshes, 0);
    assert.equal(c._viewRefreshFailed, true);
    assert.equal(c._lastRefreshFingerprintBySession.has(sessionObj), false, "failed view refresh must not commit fingerprint");

    // Next poll with unchanged idData still retries scheduleItemsViewRefresh
    failViewRefresh = false;
    await updateSessionCitationsIfDirty(c, "S1", native, [10], native.citationsByItemID);
    await new Promise(r => setTimeout(r, 40));
    assert.equal(updateCalls, 2);
    assert.equal(viewRefreshes, 1, "view refresh must retry even when idData had already been updated");
    assert.equal(c._viewRefreshFailed, false);
    assert.equal(c._lastRefreshFingerprintBySession.has(sessionObj), true);

    await updateSessionCitationsIfDirty(c, "S1", native, [10], native.citationsByItemID);
    assert.equal(updateCalls, 2);
  } finally {
    if (prevZotero === undefined) delete globalThis.Zotero; else globalThis.Zotero = prevZotero;
  }
});

test("P1: Session.cite rejects bibliography fields (type=2), treats TEMP fields (type=0) as new, and recycles failed TEMP fields", async () => {
  const { loadDomains } = require("./helpers/domain-bundle.cjs");
  let deleted = 0;
  let unserialized = 0;
  let registered = 0;
  let execCalls = 0;
  const item = { id: 7, isRegularItem: () => true, isTopLevelItem: () => true };
  let activeField;
  let shouldFailInsert = false;

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    addon: { data: { alive: true } },
    config: { addonID: "citeflow@groele", addonRef: "zoterocitation" },
    runtime: { log() {} },
    Zotero_Tabs: { selectedIndex: 0 },
    ZoteroPane: { getSelectedItems: () => [item] },
    Zotero: {
      isWin: true,
      Prefs: { get: () => true },
      Promise: { resolve: (v) => Promise.resolve(v) },
      Exception: {
        Alert: class Alert extends Error {},
        UserCancelled: class UserCancelled extends Error {}
      },
      Integration: {
        Session: function () {},
        Field: { loadExisting: async (f) => f },
        CitationField: class CitationField {
          constructor(raw) { this._field = raw?._field ?? raw; }
          async delete() { deleted++; }
          async getNoteIndex() { return 0; }
        },
        Citation: class Citation {
          constructor(field) { this.field = field; this.citationItems = []; }
          get _field() { return this.field; }
          async prepareForEditing() {}
        },
        CitationEditInterface: class { constructor(c) { this.citation = c; } },
        execCommand: async () => {
          execCalls++;
          const session = {
            sessionID: "S1",
            style: { opt: {} },
            data: { prefs: { delayCitationUpdates: true } },
            citationsByItemID: {},
            addField: async () => ({ raw: "new" }),
            getFields: async () => [],
            updateFromDocument: async () => {},
            _insertCitingResult: async (_idx, _fld, cit) => {
              if (shouldFailInsert) throw new Error("insert aborted");
              return [cit];
            },
            addCitation: async () => { registered++; }
          };
          return sandbox.Zotero.Integration.Session.prototype.cite.call(session, activeField);
        }
      },
      logError() {}
    }
  };
  sandbox.Zotero.Integration.Session.prototype.cite = async () => "native";
  vm.createContext(sandbox);
  const { citeItems } = loadDomains(sandbox);

  // Bibliography field (type=2) is rejected
  activeField = { type: 2, unserialize: async () => ({}), getNoteIndex: async () => 0 };
  await assert.rejects(citeItems([item]), /integration\.error\.notInCitation/);
  assert.equal(registered, 0);

  // TEMP placeholder field (type=0) is treated as new citation without calling unserialize()
  activeField = {
    type: 0,
    _field: { raw: "temp" },
    unserialize: async () => { unserialized++; return {}; },
    getNoteIndex: async () => 0
  };
  await citeItems([item]);
  assert.equal(unserialized, 0, "TEMP field must not be unserialized as an existing citation");
  assert.equal(registered, 1, "TEMP field must be promoted and registered as a new citation");
  assert.equal(deleted, 0);

  // Failed insertion on TEMP placeholder recycles the field via delete()
  shouldFailInsert = true;
  await assert.rejects(citeItems([item]), /insert aborted/);
  assert.equal(deleted, 1, "failed TEMP field insertion must delete/recycle the placeholder field");

  // Window title verification blocks citeItems before WinWord execCommand on mismatch
  shouldFailInsert = false;
  sandbox.addon.data.verifyDroppedWordTarget = () => false;
  await citeItems([item]);
  assert.equal(execCalls, 3, "mismatched Word window title must abort before WinWord execCommand");
});

test("P1: verifyDroppedWordTarget constrains target window title against foreground and topmost Word windows", () => {
  const prevAddon = globalThis.addon;
  try {
    let probed = { foregroundTitle: "", visibleTitles: [] };
    globalThis.addon = {
      data: {
        lastDroppedWordWindow: { title: "PaperB.docx - Word", at: Date.now() },
        probeWordWindowTitles: () => probed
      }
    };

    // Background Word window behind another active Word window is rejected
    probed = { foregroundTitle: "", visibleTitles: ["PaperA.docx - Word", "PaperB.docx - Word"] };
    assert.equal(verifyDroppedWordTarget(), false);
    assert.equal(globalThis.addon.data.lastDroppedWordWindow, undefined, "mismatch clears stale drop record");

    // Foreground mismatch is rejected
    globalThis.addon.data.lastDroppedWordWindow = { title: "PaperB.docx - Word", at: Date.now() };
    probed = { foregroundTitle: "PaperA.docx - Word", visibleTitles: ["PaperA.docx - Word", "PaperB.docx - Word"] };
    assert.equal(verifyDroppedWordTarget(), false);

    // Matching window (even with Word save-status suffix change) passes and retains lastDroppedWordWindow for naming
    globalThis.addon.data.lastDroppedWordWindow = { title: "PaperB.docx - Word", at: Date.now() };
    probed = { foregroundTitle: "PaperB.docx - 已保存 - Word", visibleTitles: ["PaperB.docx - 已保存 - Word", "PaperA.docx - Word"] };
    assert.equal(verifyDroppedWordTarget(), true);
    assert.ok(globalThis.addon.data.lastDroppedWordWindow, "matched drop record remains available for document naming");
  } finally {
    if (prevAddon === undefined) delete globalThis.addon; else globalThis.addon = prevAddon;
  }
});

test("P2: cold start defers managed tag cleanup while Word windows are open and cancels cleanup if session recovers", async () => {
  const prevZotero = globalThis.Zotero;
  const prevAddon = globalThis.addon;
  const prevSetTimeout = globalThis.setTimeout;
  const prevClearTimeout = globalThis.clearTimeout;
  try {
    let visibleTitles = ["Draft.docx - Word"];
    const tagSyncCalls = [];
    const scheduled = [];
    globalThis.addon = {
      data: {
        alive: true,
        probeWordWindowTitles: () => ({ foregroundTitle: "", visibleTitles })
      }
    };
    globalThis.Zotero = {
      ZoteroCitation: {},
      Libraries: { userLibraryID: 1 },
      Collections: { getByLibrary: () => [] },
      Integration: { sessions: {} }
    };
    globalThis.setTimeout = (fn) => { scheduled.push(fn); return scheduled.length; };
    globalThis.clearTimeout = () => {};

    const c = createLiveCitation();
    c._managedCitationTagIDs = { 10: true };
    c.syncCitationTags = async (sid, ids) => { tagSyncCalls.push([sid, ids]); };

    await c.listener(1000);
    assert.equal(tagSyncCalls.length, 0, "listener startup must not strip managed tags before Word session check");
    assert.equal(c._pendingStartupTagCleanup, true);

    // First tick while Word window is open must preserve tags
    scheduled.shift()();
    await c._listenerTickTask;
    assert.equal(tagSyncCalls.length, 0, "open Word window prevents stripping managed tags");
    assert.equal(c._pendingStartupTagCleanup, true);

    // Once Word closes with no recovered session, deferred cleanup runs cleanly
    visibleTitles = [];
    scheduled.shift()();
    await c._listenerTickTask;
    assert.deepEqual(tagSyncCalls, [["__startup__", []]]);
    assert.equal(c._pendingStartupTagCleanup, false);

    // If a session recovers before Word closes, pending startup cleanup is cancelled
    c._pendingStartupTagCleanup = true;
    c.sessions = { S1: { collection: { key: "C1" }, idData: {} } };
    globalThis.Zotero.Integration.sessions = { S1: { agent: "WinWord" } };
    c.ensureSession = async () => c.sessions.S1;
    c._syncSessionDocumentName = async () => {};
    c.refreshSessionCitations = async () => {};
    scheduled.shift()();
    await c._listenerTickTask;
    assert.equal(tagSyncCalls.length, 1, "recovered Word session cancels startup orphan tag cleanup");
    assert.equal(c._pendingStartupTagCleanup, false);
  } finally {
    globalThis.setTimeout = prevSetTimeout;
    globalThis.clearTimeout = prevClearTimeout;
    if (prevZotero === undefined) delete globalThis.Zotero; else globalThis.Zotero = prevZotero;
    if (prevAddon === undefined) delete globalThis.addon; else globalThis.addon = prevAddon;
  }
});

test("P2: preferences.xhtml uses Fluent l10n for brand heading and aria-labelledby for version section", () => {
  const xhtml = fs.readFileSync(path.join(root, "chrome/content/preferences.xhtml"), "utf8");
  assert.match(xhtml, /<html:h1\s+data-l10n-id="zoterocitation-settings-brand-title"\s*\/>/);
  assert.doesNotMatch(xhtml, /<html:h1>Zotero CiteFlow<\/html:h1>/);
  assert.doesNotMatch(xhtml, /aria-label="Version Information"/);
  assert.match(xhtml, /<html:section[^>]*aria-labelledby="zoterocitation-version-title"/);
  assert.match(xhtml, /id="zoterocitation-version-title"[^>]*data-l10n-id="zoterocitation-settings-version-title"/);
});
