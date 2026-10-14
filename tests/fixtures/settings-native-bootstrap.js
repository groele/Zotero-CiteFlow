// Test-only endpoint, installed exclusively into an isolated, unsynced profile.
// This file is excluded from the production XPI.
const endpoint = "/citeflow-settings-test";
let preferencesWindow;
let testItems = [];
function install() {}
function uninstall() {}
async function startup() {
  await Promise.all([Zotero.initializationPromise, Zotero.uiReadyPromise]);
  const expected = Zotero.Prefs.get("citationSettingsTest.dataDir");
  const normalize = path => String(path).replaceAll("/", "\\").toLowerCase();
  if (!expected || normalize(Zotero.DataDirectory.dir) !== normalize(expected)) throw Error("Isolated test profile required");
  for (let n = 0; n < 100 && !Zotero.ZoteroCitation; n++) await Zotero.Promise.delay(100);
  await Zotero.ZoteroCitation?.hooks.onStartup();
  const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
  const root = () => preferencesWindow?.document.getElementById("zoterocitation-settings");
  const snapshot = () => ({
    zoteroVersion: Zotero.version,
    tracking: !!Zotero.ZoteroCitation?.data.citation,
    paneRegistered: Zotero.PreferencePanes.pluginPanes.some(pane => pane.id === "zoterocitation-preferences"),
    patchCount: Zotero.ZoteroCitation?.data.runtime.pendingPatchCount,
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
    prefValues: Object.fromEntries(["enable", "quickCite.enable", "dragCite.enable", "citationTags.enable", "citationTags.text", "debug", "citationTagDebounceMs", "itemsViewRefreshDebounceMs", "healthWindowMs", "perfSlowThresholdMs"].map(key =>
      [key, Zotero.Prefs.get("extensions.zotero.zoterocitation." + key, true)]))
  });
  async function run(data) {
    let extra;
    if (data.action === "tagFixtures") {
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
      const oldSelection = pane.getSelectedItems; const oldColumns = pane.itemsView.getColumns;
      const oldCite = Zotero.ZoteroCitation.api.citeItems; let calls = 0;
      try {
        pane.getSelectedItems = () => [Zotero.Items.get(testItems[0])];
        pane.itemsView.getColumns = () => [{ dataKey: "citeflow@groele-citation", hidden: false }];
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
      } finally { pane.getSelectedItems = oldSelection; pane.itemsView.getColumns = oldColumns; Zotero.ZoteroCitation.api.citeItems = oldCite; }
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
      try { return [200, "application/json", JSON.stringify({ ok: true, value: await run(data) })]; }
      catch (error) { return [200, "application/json", JSON.stringify({ ok: false, error: String(error), stack: error.stack })]; }
    }
  };
}
function shutdown() { delete Zotero.Server.Endpoints[endpoint]; }
