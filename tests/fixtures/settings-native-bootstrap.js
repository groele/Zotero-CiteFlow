// Test-only endpoint, installed exclusively into an isolated, unsynced profile.
// This file is excluded from the production XPI.
const endpoint = "/citeflow-settings-test";
let preferencesWindow;
let testItems = [];
const wordTasks = new Map();
const wordDocuments = new Map();
let wordSerial = 0;
const realDragTrace = [];
function install() {}
function uninstall() {}
async function startup() {
  await Promise.all([Zotero.initializationPromise, Zotero.uiReadyPromise]);
  const expected = Zotero.Prefs.get("citationSettingsTest.dataDir");
  const normalize = path => String(path).replaceAll("/", "\\").toLowerCase();
  if (!expected || normalize(Zotero.DataDirectory.dir) !== normalize(expected)) throw Error("Isolated test profile required");
  for (let n = 0; n < 100 && !Zotero.ZoteroCitation; n++) await Zotero.Promise.delay(100);
  await Zotero.ZoteroCitation?.hooks.onStartup();
  if (Zotero.Prefs.get("citationSettingsTest.traceRealDrag")) {
    const win = Zotero.getMainWindow();
    const record = (phase, event) => {
      const transfer = event.dataTransfer;
      realDragTrace.push({ phase, trusted: event.isTrusted, screenX: event.screenX,
        screenY: event.screenY, effectAllowed: transfer?.effectAllowed,
        dropEffect: transfer?.dropEffect, cancelled: transfer?.mozUserCancelled,
        types: transfer ? [...transfer.types] : [],
        selectedIDs: win.ZoteroPane.getSelectedItems().map(item => item.id),
        preparedIDs: Zotero.ZoteroCitation?.data.views?._dragItems?.map(item => item.id) || [] });
    };
    win.document.addEventListener("dragstart", event => {
      record("start", event);
      win.queueMicrotask(() => record("start-after-handler", event));
    }, true);
    win.document.addEventListener("dragend", event => record("end", event), true);
    const originalCite = Zotero.ZoteroCitation.api.citeItems;
    Zotero.ZoteroCitation.api.citeItems = async (...args) => {
      realDragTrace.push({ phase: "cite-call", itemIDs: args[0]?.map?.(item => item.id) || [] });
      try {
        const result = await originalCite(...args);
        realDragTrace.push({ phase: "cite-complete" });
        return result;
      } catch (error) {
        realDragTrace.push({ phase: "cite-error", message: String(error) });
        throw error;
      }
    };
  }
  const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
  const root = () => preferencesWindow?.document.getElementById("zoterocitation-settings");
  const snapshot = () => ({
    testDataDir: Zotero.DataDirectory.dir,
    zoteroVersion: Zotero.version,
    tracking: !!Zotero.ZoteroCitation?.data.citation,
    paneRegistered: Zotero.PreferencePanes.pluginPanes.some(pane => pane.id === "zoterocitation-preferences"),
    paneLabel: Zotero.PreferencePanes.pluginPanes.find(pane => pane.id === "zoterocitation-preferences")?.rawLabel,
    patchCount: Zotero.ZoteroCitation?.data.runtime?.pendingPatchCount,
    columnKeys: Zotero.getMainWindow()?.ZoteroPane.itemsView?.getColumns().map(column => column.dataKey),
    visibleColumns: Zotero.getMainWindow()?.ZoteroPane.itemsView?._getColumns().filter(column => !column.hidden).map(column => column.dataKey),
    debug: Zotero.ZoteroCitation?.data.citation?._debugEnabled,
    tagDelay: Zotero.ZoteroCitation?.data.citation?._tagSyncDebounceMs,
    runtimeConfig: Zotero.ZoteroCitation?.data.citation ? {
      viewDelay: Zotero.ZoteroCitation.data.citation._itemsViewRefreshDebounceMs,
      healthWindow: Zotero.ZoteroCitation.data.citation._healthWindowMs,
      slowThreshold: Zotero.ZoteroCitation.data.citation._perfSlowThresholdMs
    } : null,
    observerCount: Zotero.ZoteroCitation?.data.preferences?._observers.length,
    panelCount: Zotero.ZoteroCitation?.data.preferences?._panels.size,
    testTags: testItems.map(id => Zotero.Items.get(id).getTags().map(tag => tag.tag)),
    controls: root() ? [...root().querySelectorAll("input")].map(input => ({
      id: input.id, value: input.type === "checkbox" ? input.checked : input.value,
      width: input.getBoundingClientRect().width, height: input.getBoundingClientRect().height,
      valid: input.checkValidity()
    })) : [],
    text: root()?.textContent.replace(/\s+/g, " ").trim(),
    status: root()?.querySelector("#zoterocitation-settings-status")?.getAttribute("data-l10n-id"),
    prefValues: Object.fromEntries(["enable", "dragCite.enable", "citationTags.enable", "citationTags.text", "debug", "citationTagDebounceMs", "itemsViewRefreshDebounceMs", "healthWindowMs", "perfSlowThresholdMs"].map(key =>
      [key, Zotero.Prefs.get("extensions.zotero.zoterocitation." + key, true)]))
  });
  async function run(data) {
    let extra;
    if (data.action === "dropTargetProbe") {
      extra = { target: Zotero.ZoteroCitation.data.views._resolveDropTarget() };
    } else if (data.action === "realDragTrace") {
      extra = { events: [...realDragTrace] };
      if (data.clear) realDragTrace.length = 0;
    } else if (data.action === "selectPhysicalItem") {
      const itemID = Number(data.itemID);
      if (!testItems.includes(itemID)) throw Error("Only owned test items may be selected");
      const win = Zotero.getMainWindow();
      const selected = await win.ZoteroPane.selectItem(itemID);
      extra = { selected, selectedIDs: win.ZoteroPane.getSelectedItems().map(item => item.id),
        activeElementID: win.document.activeElement?.id };
    } else if (data.action === "physicalStatus") {
      const win = Zotero.getMainWindow();
      extra = { selectedIDs: win.ZoteroPane.getSelectedItems().map(item => item.id),
        activeElementID: win.document.activeElement?.id,
        sessions: Object.fromEntries(Object.entries(Zotero.ZoteroCitation.api.sessions).map(([id, session]) => [id, {
          collection: session.collection?.name, childIDs: session.collection?.getChildItems(true)
        }])), events: [...realDragTrace] };
    } else if (data.action === "wordSetup") {
      await Zotero.Styles.init();
      for (let n = 0; n < 3; n++) {
        const item = new Zotero.Item("journalArticle");
        item.libraryID = Zotero.Libraries.userLibraryID;
        item.setField("title", "CiteFlow Word acceptance specimen " + n);
        item.setField("date", "2024");
        item.setCreators([{ firstName: "QA", lastName: "Author" + n, creatorType: "author" }]);
        await item.saveTx(); testItems.push(item.id);
      }
      const styles = Zotero.Styles.getVisible();
      const style = styles.find(style => /American Psychological/.test(style.title)) || styles[0];
      extra = { itemIDs: testItems, styleID: style.styleID };
    } else if (["wordPrepare", "wordInsert", "wordDrag", "wordRefresh"].includes(data.action)) {
      const normalize = path => PathUtils.normalize(path).replaceAll("\\", "/").toLowerCase();
      if (!data.document || !normalize(data.document).startsWith(normalize(PathUtils.parent(expected)) + "/")) throw Error("Word document outside test directory");
      const integration = Zotero.Integration;
      const previousHandler = integration._handleCommandError;
      integration._handleCommandError = async (_doc, _session, error) => { throw error; };
      try {
        if (data.action === "wordPrepare") {
          const app = integration.getApplication("WinWord");
          const doc = await app.getDocument(data.document);
          const metadata = new integration.DocumentData();
          metadata.style = { styleID: data.styleID, locale: "en-US", hasBibliography: true };
          metadata.prefs = { fieldType: "Field", noteType: 0, delayCitationUpdates: false,
            automaticJournalAbbreviations: false, dontAskDelayCitationUpdates: true };
          metadata.sessionID = Zotero.Utilities.randomString();
          await doc.setDocumentData(metadata.serialize());
          await doc.cleanup();
          wordDocuments.set(data.document, metadata.sessionID);
          extra = { sessionID: metadata.sessionID, fieldType: metadata.prefs.fieldType };
        } else if (["wordInsert", "wordDrag"].includes(data.action)) {
          // Check the actual active document before asking production citeItems
          // to use its normal active-document path; do not redirect that path.
          const app = integration.getApplication("WinWord");
          const active = await app.getDocument("");
          const metadata = new integration.DocumentData(await active.getDocumentData());
          await active.cleanup();
          if (metadata.sessionID !== wordDocuments.get(data.document)) throw Error("Active Word document is not the owned test document");
          const items = (data.itemIDs || [testItems[0]]).map(id => Zotero.Items.get(id));
          if (data.action === "wordDrag") {
            const win = Zotero.getMainWindow(), pane = win.ZoteroPane;
            const oldSelection = pane.getSelectedItems;
            let completion;
            const originalCite = Zotero.ZoteroCitation.api.citeItems;
            const viewPrototype = Zotero.ZoteroCitation.data.views.constructor.prototype;
            const originalTarget = viewPrototype._resolveDropTarget;
            try {
              // A synthetic DragEvent has no native drop target. Isolate the
              // citation pipeline test from the separate physical-drop test.
              viewPrototype._resolveDropTarget = () => "word-confirmed";
              pane.getSelectedItems = () => items;
              Zotero.ZoteroCitation.api.citeItems = requested => (completion = originalCite(requested));
              const transfer = new win.DataTransfer(); transfer.dropEffect = "copy";
              pane.itemsView.onDragStart({ dataTransfer: transfer }, 0);
              if (!transfer.types.includes("text/plain") || transfer.getData("text/plain") !== "") throw Error("Drag leaked native bibliography text");
              win.document.dispatchEvent(new win.DragEvent("dragend", { bubbles: true, dataTransfer: transfer,
                screenX: win.screenX + win.outerWidth + 1000, screenY: win.screenY + win.outerHeight + 1000 }));
              if (!completion) throw Error("Drag did not dispatch citation insertion");
              await completion;
            } finally {
              viewPrototype._resolveDropTarget = originalTarget;
              pane.getSelectedItems = oldSelection;
              Zotero.ZoteroCitation.api.citeItems = originalCite;
            }
          } else await Zotero.ZoteroCitation.api.citeItems(items);
          wordDocuments.set(data.document, integration.currentSession?.sessionID || metadata.sessionID);
          await Zotero.Promise.delay(500);
          extra = { sessionID: wordDocuments.get(data.document) };
        } else {
          await integration.execCommand("WinWord", "refresh", data.document, 1);
        }
      } finally { integration._handleCommandError = previousHandler; }
      extra = { ...extra, sessions: Object.fromEntries(Object.entries(Zotero.ZoteroCitation.api.sessions).map(([id, session]) => [id, {
        collection: session.collection?.name, idData: session.idData, childIDs: session.collection?.getChildItems(true)
      }])), diagnostics: Zotero.ZoteroCitation.api.getDiagnostics?.() };
    } else if (data.action === "tagFixtures") {
      for (let n = 0; n < 2; n++) {
        const item = new Zotero.Item("journalArticle");
        item.libraryID = Zotero.Libraries.userLibraryID;
        item.setField("title", "CiteFlow settings tag test " + n);
        if (n === 1) { item.addTag("/Citations"); item.addTag("已引用"); }
        await item.saveTx(); testItems.push(item.id);
      }
      const citation = Zotero.ZoteroCitation.data.citation;
      citation._sessionCitedIDs.__settings_test = [...testItems];
      await citation.syncCitationTags("__settings_test", testItems);
    } else if (data.action === "open") {
      preferencesWindow = Zotero.Utilities.Internal.openPreferences("zoterocitation-preferences");
      for (let n = 0; n < 100 && !root(); n++) await Zotero.Promise.delay(50);
      if (!root()) throw Error("Settings pane did not load");
      await preferencesWindow.Zotero_Preferences._loadPane("zoterocitation-preferences");
    } else if (data.action === "change") {
      const input = root()?.querySelector("#zoterocitation-setting-" + data.id);
      if (!input) throw Error("Unknown control");
      if (input.type === "checkbox") input.checked = data.value;
      else input.value = String(data.value);
      input.dispatchEvent(new preferencesWindow.Event("change", { bubbles: true }));
    } else if (data.action === "reset") {
      root().querySelector("#zoterocitation-settings-reset").click();
    } else if (data.action === "batch") {
      for (const change of data.changes) {
        const input = root().querySelector("#zoterocitation-setting-" + change.id);
        if (input.type === "checkbox") input.checked = change.value;
        else input.value = String(change.value);
        input.dispatchEvent(new preferencesWindow.Event("change", { bubbles: true }));
      }
    } else if (data.action === "keyboardProbe") {
      const win = Zotero.getMainWindow(); const pane = win.ZoteroPane;
      const oldSelection = pane.getSelectedItems; const oldCommand = Zotero.Integration.execCommand;
      const target = win.document.createElementNS("http://www.w3.org/1999/xhtml", data.editing ? "input" : "div");
      win.document.documentElement.append(target); let calls = 0;
      try {
        pane.getSelectedItems = () => [Zotero.Items.get(testItems[0])];
        Zotero.Integration.execCommand = async () => { calls++; };
        const event = new win.KeyboardEvent("keydown", { key: "'", bubbles: true, cancelable: true });
        target.dispatchEvent(event); await Zotero.Promise.delay(30);
        extra = { calls, prevented: event.defaultPrevented };
      } finally { pane.getSelectedItems = oldSelection; Zotero.Integration.execCommand = oldCommand; target.remove(); }
    } else if (data.action === "dragProbe") {
      const win = Zotero.getMainWindow(); const pane = win.ZoteroPane;
      const oldSelection = pane.getSelectedItems;
      const oldCite = Zotero.ZoteroCitation.api.citeItems; let calls = 0;
      const viewPrototype = Zotero.ZoteroCitation.data.views.constructor.prototype;
      const originalTarget = viewPrototype._resolveDropTarget;
      try {
        viewPrototype._resolveDropTarget = () => data.target || "word-confirmed";
        pane.getSelectedItems = () => [Zotero.Items.get(testItems[0])];
        Zotero.ZoteroCitation.api.citeItems = async () => { calls++; };
        const transfer = new win.DataTransfer(); transfer.dropEffect = "copy";
        pane.itemsView.onDragStart({ dataTransfer: transfer }, 0);
        const prepared = transfer.types.includes("text/plain");
        if (data.cancelAfterStart) {
          const control = root().querySelector("#zoterocitation-setting-dragCite");
          control.checked = false; control.dispatchEvent(new preferencesWindow.Event("change", { bubbles: true }));
          await Zotero.ZoteroCitation.data.preferences.settled;
        }
        win.document.dispatchEvent(new win.DragEvent("dragend", { bubbles: true, dataTransfer: transfer,
          screenX: win.screenX + win.outerWidth + 1000, screenY: win.screenY + win.outerHeight + 1000 }));
        await Zotero.Promise.delay(30); extra = { calls, prepared };
      } finally {
        viewPrototype._resolveDropTarget = originalTarget;
        pane.getSelectedItems = oldSelection;
        Zotero.ZoteroCitation.api.citeItems = oldCite;
      }
    } else if (data.action === "debugProbe") {
      const oldDebug = Zotero.debug; let lines = 0;
      try { Zotero.debug = () => { lines++; }; Zotero.ZoteroCitation.data.runtime.log("settings debug probe"); }
      finally { Zotero.debug = oldDebug; }
      extra = { lines };
    } else if (data.action === "performanceProbe") {
      const citation = Zotero.ZoteroCitation.data.citation;
      const oldErrors = citation._errors; const oldMetric = citation._perfStats.syncCitationTags;
      try {
        citation._errors = [{ time: Date.now() - 30000 }, { time: Date.now() }];
        citation._perfStats.syncCitationTags = { count: 0, totalMs: 0, lastMs: 0, maxMs: 0, slowCount: 0 };
        citation._recordPerf("syncCitationTags", 20);
        extra = { recentErrors: citation.getDebugStats().recent.errorCount, slowCount: citation._perfStats.syncCitationTags.slowCount };
      } finally { citation._errors = oldErrors; citation._perfStats.syncCitationTags = oldMetric; }
    } else if (data.action === "disable") {
      preferencesWindow?.close(); preferencesWindow = undefined;
      const oldAddon = Zotero.ZoteroCitation; const plugin = await AddonManager.getAddonByID("citeflow@groele");
      await plugin.disable();
      // AddonManager can resolve before Zotero's async shutdown observer.
      await oldAddon.hooks.onShutdown();
      extra = { remainingObservers: oldAddon.data.preferences._observers.length,
        remainingPanels: oldAddon.data.preferences._panels.size, remainingPatches: oldAddon.data.runtime.pendingPatchCount };
    } else if (data.action === "enable") {
      const plugin = await AddonManager.getAddonByID("citeflow@groele"); await plugin.enable();
      for (let n = 0; n < 100 && !Zotero.ZoteroCitation; n++) await Zotero.Promise.delay(50);
      if (!Zotero.ZoteroCitation) throw Error("CiteFlow did not finish re-enabling");
      await Zotero.ZoteroCitation.hooks.onStartup();
    } else if (data.action === "close") {
      preferencesWindow?.close(); preferencesWindow = undefined;
    } else if (data.action === "quit") {
      preferencesWindow?.close();
      Services.prefs.savePrefFile(null);
      Zotero.Promise.delay(100).then(() => Services.startup.quit(Services.startup.eAttemptQuit));
    } else if (data.action !== "status") throw Error("Unsupported test action");
    await Zotero.Promise.delay(100);
    await Zotero.ZoteroCitation?.data.preferences?.settled;
    await Zotero.ZoteroCitation?.data.citation?._tagSyncQueue;
    if (root()) await preferencesWindow.document.l10n.translateFragment(root());
    return { ...snapshot(), probe: extra };
  }
  Zotero.Server.Endpoints[endpoint] = function() {};
  Zotero.Server.Endpoints[endpoint].prototype = {
    supportedMethods: ["POST"], supportedDataTypes: ["application/json"], permitBookmarklet: false,
    async init({ data }) {
      if (data.expectedDataDir && normalize(data.expectedDataDir) !== normalize(expected)) {
        return [409, "application/json", JSON.stringify({ ok: false, error: "Wrong isolated test host" })];
      }
      if (data.action === "wordResult") return [200, "application/json", JSON.stringify({ ok: true, value: wordTasks.get(data.id) || { pending: true } })];
      if (data.action.startsWith("word")) {
        const id = ++wordSerial;
        wordTasks.set(id, { pending: true });
        Zotero.Promise.delay(0).then(() => run(data)).then(value => wordTasks.set(id, { pending: false, ok: true, value }),
          error => wordTasks.set(id, { pending: false, ok: false, error: String(error), stack: error.stack }));
        return [202, "application/json", JSON.stringify({ ok: true, value: { id, pending: true } })];
      }
      try { return [200, "application/json", JSON.stringify({ ok: true, value: await run(data) })]; }
      catch (error) { return [200, "application/json", JSON.stringify({ ok: false, error: String(error), stack: error.stack })]; }
    }
  };
}
function shutdown() { delete Zotero.Server.Endpoints[endpoint]; }
