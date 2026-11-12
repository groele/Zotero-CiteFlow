import { config } from "./config.ts";
import { initLocale } from "./modules/locale.ts";
import { Citation } from "./modules/citation.ts";
import Views from "./modules/views.ts";
import { Preferences } from "./modules/preferences.ts";
import { closeDropTargetCtypes, probeForegroundWordTitle, probeWordWindowTitles } from "./modules/drop-target.ts";
type HostWindow = NonNullable<ConstructorParameters<typeof Views>[0]> & { Zotero_Tabs?: unknown };
interface CitationRuntime { listener(interval: number): Promise<void>; applyPreferences(): Promise<{ complete?: boolean } | undefined>; clear(): Promise<void> }
interface AddonRuntime { data: { alive: boolean; citation?: CitationRuntime; views?: Views; preferences?: Preferences; locale?: unknown; probeWordWindowTitles?: typeof probeWordWindowTitles; probeForegroundWordTitle?: typeof probeForegroundWordTitle; lastDroppedWordWindow?: unknown }; api: { initPreferences?: (win: HostWindow) => void } }
interface Binding { views: Views; closed: boolean; readyPromise: Promise<void> | null }
interface HookGlobals { window?: HostWindow; document?: Document; ZoteroPane?: HostWindow["ZoteroPane"]; Zotero_Tabs?: unknown }
declare const addon: AddonRuntime;
declare const runtime: { unregisterAll(): void };
const hookGlobals = globalThis as unknown as HookGlobals;
const windowBindings = new Map<HostWindow, Binding>();
let startupPromise: Promise<void> | undefined;
let shutdownPromise: Promise<void> | undefined;
async function onStartup(): Promise<void> {
  if (startupPromise) return startupPromise;
  if (shutdownPromise || addon.data.alive === false) return;
  startupPromise = (async () => {
    await Promise.all([Zotero.initializationPromise, Zotero.unlockPromise, Zotero.uiReadyPromise]);
    if (!addon.data.alive) return;
    const mainWindow = (Zotero.getMainWindow?.()
      || Zotero.getMainWindows?.()?.find((w) => (w as unknown as HostWindow)?.document && !(w as unknown as HostWindow)?.closed)) as unknown as HostWindow | undefined;
    if (mainWindow?.document) {
      hookGlobals.window = mainWindow;
      hookGlobals.document = mainWindow.document;
      hookGlobals.ZoteroPane = mainWindow.ZoteroPane;
      hookGlobals.Zotero_Tabs = mainWindow.Zotero_Tabs;
    }
    await initLocale();
    if (!addon.data.alive) return;
    const preferences = new Preferences(applyPreferences);
    addon.data.preferences = preferences;
    addon.api.initPreferences = (win: HostWindow) => preferences.init(win as unknown as Parameters<Preferences["init"]>[0]);
    await preferences.register();
    if (!addon.data.alive) return;
    if (Zotero.Prefs.get("extensions.zotero.zoterocitation.enable", true) === false) {
      return;
    }
    addon.data.probeWordWindowTitles = probeWordWindowTitles;
    addon.data.probeForegroundWordTitle = probeForegroundWordTitle;
    const citation = new Citation() as unknown as CitationRuntime;
    addon.data.citation = citation;
    await citation.listener(1e3);
    if (!addon.data.alive) return;
    const views = new Views();
    addon.data.views = views;
    const windows = Zotero.getMainWindows?.() || (mainWindow ? [mainWindow] : []);
    for (const win of windows) {
      try {
        await attachWindow(win as unknown as HostWindow);
      } catch (error) {
        Zotero.logError(error as Error);
      }
    }
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
async function attachWindow(win: HostWindow): Promise<void> {
  if (!win?.ZoteroPane || win.closed || !addon.data.alive || !addon.data.citation) return;
  const existing = windowBindings.get(win);
  if (existing) { await existing.readyPromise; return; }
  const views = new Views(win);
  const binding: Binding = { views, closed: false, readyPromise: null };
  windowBindings.set(win, binding);
  binding.readyPromise = (async () => {
    try {
      const prepared = await views.prepareWindow?.();
      if (prepared === false || binding.closed || win.closed || !addon.data.alive) {
        await detachWindow(win);
        return;
      }
      await views.patchIcon();
      if (binding.closed || win.closed || !addon.data.alive) { await detachWindow(win); return; }
      await views.dragCite();
      if (binding.closed || win.closed || !addon.data.alive) { await detachWindow(win); return; }
    } catch (error) {
      await detachWindow(win);
      throw error;
    }
  })();
  return binding.readyPromise;
}
function rebindGlobalWindow(closingWin: HostWindow | null = null): void {
  if (closingWin && hookGlobals.window !== closingWin) return;
  const nextWin = [...windowBindings.keys()].find(w => w !== closingWin && w?.document && !w.closed)
    || (Zotero.getMainWindows?.() as unknown as HostWindow[] | undefined)?.find(w => w !== closingWin && w?.document && !w.closed)
    || null;
  if (nextWin) {
    hookGlobals.window = nextWin;
    hookGlobals.document = nextWin.document;
    hookGlobals.ZoteroPane = nextWin.ZoteroPane;
    hookGlobals.Zotero_Tabs = nextWin.Zotero_Tabs;
  } else {
    hookGlobals.window = undefined; hookGlobals.document = undefined; hookGlobals.ZoteroPane = undefined; hookGlobals.Zotero_Tabs = undefined;
  }
}
async function detachWindow(win: HostWindow): Promise<void> {
  const binding = windowBindings.get(win);
  if (binding) {
    binding.closed = true;
    windowBindings.delete(win);
    await runShutdownStep("dispose window UI", () => binding.views.dispose());
  }
  rebindGlobalWindow(win);
}
async function onMainWindowLoad(win: HostWindow): Promise<void> {
  await startupPromise;
  if (!hookGlobals.window && win?.document) {
    hookGlobals.window = win;
    hookGlobals.document = win.document;
    hookGlobals.ZoteroPane = win.ZoteroPane;
    hookGlobals.Zotero_Tabs = win.Zotero_Tabs;
  }
  try {
    await attachWindow(win);
  } catch (error) {
    Zotero.logError(error as Error);
  }
}
async function onMainWindowUnload(win: HostWindow): Promise<void> {
  await detachWindow(win);
}
async function applyPreferences(): Promise<{ complete?: boolean } | undefined> {
  if (!addon.data.alive) return;
  const result = await addon.data.citation?.applyPreferences();
  for (const binding of windowBindings.values()) {
    if (!binding.closed) await binding.views.dragCite();
  }
  return result;
}
async function runShutdownStep(name: string, action: () => unknown | Promise<unknown>): Promise<void> {
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
async function onShutdown(): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
  addon.data.alive = false;
  const preferences = addon.data.preferences;
  if (preferences) {
    await runShutdownStep("remove preferences", () => preferences.dispose());
    delete addon.api.initPreferences;
  }
  await runShutdownStep("dispose UI", () => addon.data.views?.dispose?.());
  for (const win of [...windowBindings.keys()]) await detachWindow(win);
  await runShutdownStep("clear citation state", () => addon.data.citation?.clear?.());
  await runShutdownStep("close drop-target native libraries", () => {
    delete addon.data.probeWordWindowTitles;
    delete addon.data.probeForegroundWordTitle;
    delete addon.data.lastDroppedWordWindow;
    if (typeof closeDropTargetCtypes === "function") closeDropTargetCtypes();
  });
  await runShutdownStep("restore host methods", () => runtime.unregisterAll());
  addon.data.locale = undefined;
  hookGlobals.window = undefined; hookGlobals.document = undefined; hookGlobals.ZoteroPane = undefined; hookGlobals.Zotero_Tabs = undefined;
  const host = Zotero as unknown as Record<string, unknown>;
  if (host[config.addonInstance] === addon) delete host[config.addonInstance];
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
