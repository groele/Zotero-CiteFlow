declare const window: Window;
declare const document: Document;
// Zotero loads the script before inserting the preference fragment.
interface PreferencesWindow extends Window {
  __zoteroCiteFlowPreferencesLoader?: () => void;
}
interface PreferencesHost {
  ZoteroCitation?: { api?: { initPreferences?(win: Window): void } };
}
const preferencesWindow = window as PreferencesWindow;
const preferencesHost = Zotero as unknown as PreferencesHost;
const rootID = "zoterocitation-settings";
const loaderKey = "__zoteroCiteFlowPreferencesLoader";
preferencesWindow[loaderKey]?.();
const controller = new AbortController();
const initialize = (): void => {
  if (document.getElementById(rootID)) preferencesHost.ZoteroCitation?.api?.initPreferences?.(window);
};
const onLoad = (event: Event): void => {
  if ((event.target as Element | null)?.id === rootID) initialize();
};
const dispose = (): void => {
  controller.abort();
  if (preferencesWindow[loaderKey] === dispose) delete preferencesWindow[loaderKey];
};
preferencesWindow[loaderKey] = dispose;
document.addEventListener("load", onLoad, { capture: true, signal: controller.signal });
window.addEventListener("unload", dispose, { signal: controller.signal });
initialize();
