import { config } from "./config.mjs";
import { initLocale } from "./modules/locale.mjs";
import { Citation } from "./modules/citation.mjs";
import Views from "./modules/views.mjs";
import { Preferences } from "./modules/preferences.mjs";
const windowBindings = new Map();
let startupPromise;
let shutdownPromise;
async function onStartup() {
  if (startupPromise) return startupPromise;
  if (shutdownPromise || addon.data.alive === false) return;
  startupPromise = (async () => {
    await Promise.all([Zotero.initializationPromise, Zotero.unlockPromise, Zotero.uiReadyPromise]);
    if (!addon.data.alive) return;
    const mainWindow = Zotero.getMainWindow();
    if (!mainWindow?.document) throw new Error("Zotero main window is unavailable");
    globalThis.window = mainWindow;
    globalThis.document = mainWindow.document;
    globalThis.ZoteroPane = mainWindow.ZoteroPane;
    globalThis.Zotero_Tabs = mainWindow.Zotero_Tabs;
    await initLocale();
    if (!addon.data.alive) return;
    const preferences = new Preferences(applyPreferences);
    addon.data.preferences = preferences;
    addon.api.initPreferences = win => preferences.init(win);
    await preferences.register();
    if (!addon.data.alive) return;
    if (Zotero.Prefs.get("extensions.zotero.zoterocitation.enable", true) === false) {
      return;
    }
    const citation = new Citation();
    addon.data.citation = citation;
    await citation.listener(1e3);
    if (!addon.data.alive) return;
    const views = new Views();
    addon.data.views = views;
    for (const win of Zotero.getMainWindows?.() || [mainWindow]) await attachWindow(win);
    if (!addon.data.alive) return;
    await views.createCitationColumn();
    if (!addon.data.alive) return;
  })();
  try {
    return await startupPromise;
  } catch (error) {
    if (addon.data.alive) {
      await onShutdown();
    }
    throw error;
  }
}
async function attachWindow(win) {
  if (!win?.ZoteroPane || !addon.data.alive || !addon.data.citation || windowBindings.has(win)) return;
  const views = new Views(win);
  const binding = { views, closed: false };
  windowBindings.set(win, binding);
  try {
    await views.prepareWindow?.();
    if (binding.closed || !addon.data.alive) return;
    await views.patchIcon();
    if (binding.closed || !addon.data.alive) return;
    await views.dragCite();
    if (binding.closed || !addon.data.alive) return;
  } catch (error) {
    await detachWindow(win);
    throw error;
  }
}
async function detachWindow(win) {
  const binding = windowBindings.get(win);
  if (!binding) return;
  binding.closed = true;
  windowBindings.delete(win);
  await runShutdownStep("dispose window UI", () => binding.views.dispose());
  if (globalThis.window === win) {
    globalThis.window = globalThis.document = globalThis.ZoteroPane = globalThis.Zotero_Tabs = undefined;
  }
}
async function onMainWindowLoad(win) {
  await startupPromise;
  await attachWindow(win);
}
async function onMainWindowUnload(win) {
  await detachWindow(win);
}
async function applyPreferences() {
  if (!addon.data.alive) return;
  const result = await addon.data.citation?.applyPreferences();
  for (const binding of windowBindings.values()) {
    if (!binding.closed) await binding.views.dragCite();
  }
  return result;
}
async function runShutdownStep(name, action) {
  try {
    await action();
  } catch (error) {
    try {
      Zotero.logError(new Error(`ZoteroCitation shutdown failed during ${name}`, { cause: error }));
    } catch (logError) {
      console.error(`ZoteroCitation shutdown failed during ${name}`, error, logError);
    }
  }
}
async function onShutdown() {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
  addon.data.alive = false;
  if (addon.data.preferences) {
    await runShutdownStep("remove preferences", () => addon.data.preferences.dispose());
    delete addon.api.initPreferences;
  }
  await runShutdownStep("dispose UI", () => addon.data.views?.dispose?.());
  for (const win of [...windowBindings.keys()]) await detachWindow(win);
  await runShutdownStep("clear citation state", () => addon.data.citation?.clear?.());
  await runShutdownStep("restore host methods", () => runtime.unregisterAll());
  addon.data.locale = undefined;
  globalThis.window = globalThis.document = globalThis.ZoteroPane = globalThis.Zotero_Tabs = undefined;
  if (Zotero[config.addonInstance] === addon) delete Zotero[config.addonInstance];
  })();
  return shutdownPromise;
}
var hooks_default = {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload
};
export default hooks_default;
