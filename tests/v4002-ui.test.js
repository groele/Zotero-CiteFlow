const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Reuse only the VM fixture and helpers from the stability suite. Its runner
// is after this prefix and is intentionally not evaluated here.
process.env.CITATION_SOURCE_DIR = ".";
const fixturePath = path.join(__dirname, "v40-stability.test.js");
const fixture = fs.readFileSync(fixturePath, "utf8").split("\n(async () => {\n")[0];
const checks = `
(async () => {
  const assert = globalThis.assert;
  let registeredOptions;
  sandbox.Zotero.ItemTreeManager.registerColumns = async options => {
    registeredOptions = options;
    return ["zoterocitation\\@polygon.org-citation"];
  };
  const unregistered = [];
  sandbox.Zotero.ItemTreeManager.unregisterColumns = keys => unregistered.push(...keys);
  sandbox.Zotero.ZoteroCitation = { api: { activeSessionID: "A", sessions: {
    A: { collection: { key: "WORD", libraryID: 1 }, idData: { 7: { plainCitation: "1: A" } } },
    B: { collection: { key: "OTHER", libraryID: 1 }, idData: { 7: { plainCitation: "2: B" } } }
  } } };
  sandbox.Zotero.Integration.currentSession = { sessionID: "B" };
  sandbox.ZoteroPane.getSelectedCollections = () => [
    { key: "WORD", libraryID: 1 }, { key: "WORD", libraryID: 1 }
  ];

  const view = Object.create(Views.prototype);
  view._disposed = false;
  await view.createCitationColumn();
  assert.equal(registeredOptions.dataProvider({ id: 7 }, "citation"), "1: A",
    "duplicate selection entries must not create false ambiguity");
  sandbox.ZoteroPane.itemsView.getColumns = () => [
    { dataKey: "othercitation", hidden: false },
    { dataKey: "zoterocitation\\@polygon.org-citation", hidden: true }
  ];
  assert.equal(view.getColumnInfo("citation")?.hidden, true,
    "drag state must use this add-on's column when another column has a similar name");
  view.dispose();
  assert.deepEqual(unregistered, ["zoterocitation\\@polygon.org-citation"]);

  const classNames = new Set(["icon-search"]);
  const iconNode = {
    style: { backgroundImage: "url(native.png)" },
    classList: {
      contains: name => classNames.has(name),
      add: name => classNames.add(name),
      remove: name => classNames.delete(name)
    }
  };
  const iconView = Object.create(Views.prototype);
  iconView._rememberIconNode(iconNode);
  iconNode.style.backgroundImage = "url(chrome://zoterocitation/content/icons/word.png)";
  iconNode.classList.remove("icon-search");
  iconNode.classList.add("icon-publications");
  iconView.dispose();
  assert.equal(iconNode.style.backgroundImage, "url(native.png)");
  assert.equal(classNames.has("icon-search"), true);
  assert.equal(classNames.has("icon-publications"), false);

  const handlers = new Map();
  sandbox.document = {
    addEventListener: (type, fn) => handlers.set(type, fn),
    removeEventListener: (type, fn) => { if (handlers.get(type) === fn) handlers.delete(type); },
    documentElement: { getBoundingClientRect: () => ({ width: 800, height: 600 }) }
  };
  sandbox.ztoolkit.patch = () => {};
  sandbox.ZoteroPane.getSelectedItems = () => [{ isRegularItem: () => true, isTopLevelItem: () => true }];
  sandbox.Zotero.Prefs.set("extensions.zotero.zoterocitation.dragCite.enable", false, true);
  const disabledView = Object.create(Views.prototype);
  disabledView.getColumnInfo = () => ({ hidden: false });
  await disabledView.dragCite();
  assert.equal(handlers.size, 0, "disabled drag preference must not install a dragend listener");

  const hookStart = source.indexOf("  // src/hooks.ts");
  const hookEnd = source.indexOf("  // src/addon.ts", hookStart);
  assert.ok(hookStart >= 0 && hookEnd > hookStart, "hooks slice must be present");
  vm.runInContext(source.slice(hookStart, hookEnd) + "; globalThis.__hooks = hooks_default;", sandbox);
  let clearCalls = 0, disposeCalls = 0, unregisterCalls = 0;
  sandbox.document = { removeEventListener() {} };
  sandbox.config.addonInstance = "ZoteroCitation";
  sandbox.addon.data.alive = true;
  sandbox.addon.data.views = { dispose: () => { disposeCalls++; } };
  sandbox.addon.data.citation = { clear: async () => { clearCalls++; } };
  sandbox.ztoolkit.unregisterAll = () => { unregisterCalls++; };
  sandbox.ztoolkit.Prompt = { unregisterAll() { unregisterCalls++; } };
  sandbox.Zotero.ZoteroCitation = sandbox.addon;
  await sandbox.__hooks.onShutdown();
  await sandbox.__hooks.onShutdown();
  assert.equal(clearCalls, 1, "repeated shutdown must clear citation state once");
  assert.equal(disposeCalls, 1);
  assert.equal(unregisterCalls, 2);
  assert.equal("ZoteroCitation" in sandbox.Zotero, false);

  console.log("40.0.2 UI lifecycle suites passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
`;
const sandbox = {
  assert,
  require,
  console,
  process,
  __dirname: path.dirname(fixturePath),
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval
};
vm.runInNewContext(fixture + checks, sandbox, { filename: "v4002-ui-fixture.js" });

async function testBootstrapWindowLookupAndCancellation() {
const bootstrapPath = path.join(__dirname, "..", "bootstrap.js");
  const source = fs.readFileSync(bootstrapPath, "utf8");
  const listeners = new Set();
  let loadHandler;
  const existingWindow = {
    addEventListener: (_type, handler) => { loadHandler = handler; },
    removeEventListener() {}
  };
  const initializationPromise = Promise.resolve();
  const context = {
    console,
    Promise,
    setTimeout,
    clearTimeout,
    Ci: { nsIInterfaceRequestor: {}, nsIDOMWindowInternal: {}, nsIDOMWindow: {} },
    Cc: {},
    Cu: { unload() {} },
    Components: { classes: {}, interfaces: {} },
    APP_SHUTDOWN: "app-shutdown",
    ADDON_DISABLE: "addon-disable",
    Services: {
      wm: {
        getEnumerator: () => ({
          hasMoreElements: () => !context._enumerated,
          getNext: () => { context._enumerated = true; return existingWindow; }
        }),
        addListener: listener => listeners.add(listener),
        removeListener: listener => listeners.delete(listener)
      }
    },
    _enumerated: false
  };
  vm.createContext(context);
  vm.runInContext(source + "; globalThis.__wait = waitForZotero; globalThis.__startup = startup; globalThis.__shutdown = shutdown;", context);
  const wait = context.__wait();
  assert.equal(typeof loadHandler, "function", "existing loading window must receive a load listener");
  existingWindow.Zotero = { initializationPromise };
  loadHandler();
  await wait;
  assert.equal(listeners.size, 0);

  // A disable arriving while waitForZotero is pending must prevent the later
  // startup continuation from registering chrome or loading the bundle.
  context._enumerated = false;
  delete existingWindow.Zotero;
  context.Zotero = undefined;
  let scriptLoads = 0;
  context.Services.scriptloader = { loadSubScript: () => { scriptLoads++; } };
  const pendingStartup = context.__startup({ resourceURI: { spec: "file:///citation/" } }, "startup");
  await Promise.resolve();
  await context.__shutdown({}, context.APP_SHUTDOWN);
  existingWindow.Zotero = { initializationPromise };
  loadHandler();
  await pendingStartup;
  assert.equal(scriptLoads, 0);
  console.log("PASS testBootstrapWindowLookupAndCancellation");
}

testBootstrapWindowLookupAndCancellation().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
