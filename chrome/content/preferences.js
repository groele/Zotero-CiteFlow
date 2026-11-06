"use strict";
(() => {
  // src/preferences.ts
  var preferencesWindow = window;
  var preferencesHost = Zotero;
  var rootID = "zoterocitation-settings";
  var loaderKey = "__zoteroCiteFlowPreferencesLoader";
  preferencesWindow[loaderKey]?.();
  var controller = new AbortController();
  var initialize = () => {
    if (document.getElementById(rootID)) preferencesHost.ZoteroCitation?.api?.initPreferences?.(window);
  };
  var onLoad = (event) => {
    if (event.target?.id === rootID) initialize();
  };
  var dispose = () => {
    controller.abort();
    if (preferencesWindow[loaderKey] === dispose) delete preferencesWindow[loaderKey];
  };
  preferencesWindow[loaderKey] = dispose;
  document.addEventListener("load", onLoad, { capture: true, signal: controller.signal });
  window.addEventListener("unload", dispose, { signal: controller.signal });
  initialize();
})();
