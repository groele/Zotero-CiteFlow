// Zotero inserts preference fragments after loading their registered scripts.
// The fragment receives a non-bubbling load event, so listen in capture phase.
(() => {
  const rootID = "zoterocitation-settings";
  const loaderKey = "__zoteroCiteFlowPreferencesLoader";
  window[loaderKey]?.();

  const initialize = () => {
    if (document.getElementById(rootID)) {
      Zotero.ZoteroCitation?.api?.initPreferences?.(window);
    }
  };
  const onLoad = event => {
    if (event.target?.id === rootID) initialize();
  };
  const dispose = () => {
    document.removeEventListener("load", onLoad, true);
    window.removeEventListener("unload", dispose);
    if (window[loaderKey] === dispose) delete window[loaderKey];
  };

  window[loaderKey] = dispose;
  document.addEventListener("load", onLoad, true);
  window.addEventListener("unload", dispose);
  initialize();
})();
