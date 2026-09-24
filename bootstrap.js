/**
 * Most of this code is from Zotero team's official Make It Red example[1]
 * or the Zotero 7 documentation[2].
 * [1] https://github.com/zotero/make-it-red
 * [2] https://www.zotero.org/support/dev/zotero_7_for_developers
 */

if (typeof Zotero === "undefined") {
    var Zotero;
}

var chromeHandle;
// A bootstrap shutdown can race with the asynchronous Zotero/window lookup.
// Incrementing this token makes an in-flight startup a no-op after disable.
var startupGeneration = 0;
var cancelZoteroWait;

// In Zotero 6, bootstrap methods are called before Zotero is initialized, and using include.js
// to get the Zotero XPCOM service would risk breaking Zotero startup. Instead, wait for the main
// Zotero window to open and get the Zotero object from there.
//
// In Zotero 7, bootstrap methods are not called until Zotero is initialized, and the 'Zotero' is
// automatically made available.
async function waitForZotero() {
    if (typeof Zotero !== "undefined") {
        await Zotero.initializationPromise;
        return;
    }

    const getZotero = (domWindow) => {
        try {
            return domWindow?.Zotero || domWindow?.wrappedJSObject?.Zotero;
        } catch (_) {
            return null;
        }
    };
    const useWindow = (domWindow) => {
        const zotero = getZotero(domWindow);
        if (!zotero) return false;
        Zotero = zotero;
        return true;
    };

    // Zotero's main window is navigator:browser in current releases. Check
    // every existing window first, including one that is still loading.
    const pendingWindows = [];
    var windows = Services.wm.getEnumerator("navigator:browser");
    while (windows.hasMoreElements()) {
        const domWindow = windows.getNext();
        if (useWindow(domWindow)) {
            await Zotero.initializationPromise;
            return;
        }
        pendingWindows.push(domWindow);
    }

    await new Promise((resolve) => {
        let settled = false;
        const loads = new Map();
        const cleanup = () => {
            Services.wm.removeListener(listener);
            for (const [win, handler] of loads) win.removeEventListener("load", handler, false);
            loads.clear();
            cancelZoteroWait = null;
        };
        cancelZoteroWait = () => { settled = true; cleanup(); resolve(); };
        const finish = (domWindow) => {
            if (settled || !useWindow(domWindow)) return;
            settled = true;
            cleanup();
            resolve();
        };
        const attachLoad = (domWindow) => {
            if (settled || !domWindow?.addEventListener) return;
            const loadHandler = () => {
                domWindow.removeEventListener("load", loadHandler, false);
                finish(domWindow);
            };
            loads.set(domWindow, loadHandler);
            domWindow.addEventListener("load", loadHandler, false);
            // A window can have finished loading between enumeration and
            // listener registration. Resolve it on the same turn if Zotero
            // has become available already.
            finish(domWindow);
        };
        var listener = {
            onOpenWindow: function (aWindow) {
                let domWindow = aWindow
                    .QueryInterface(Ci.nsIInterfaceRequestor)
                    .getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
                attachLoad(domWindow);
            },
        };
        pendingWindows.forEach(attachLoad);
        if (!settled) Services.wm.addListener(listener);
    });
    if (Zotero) await Zotero.initializationPromise;
}

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
    const generation = ++startupGeneration;
    try {
        await waitForZotero();
        if (generation !== startupGeneration) return;

        // String 'rootURI' introduced in Zotero 7
        if (!rootURI) {
            rootURI = resourceURI.spec;
        }
        // Ensure rootURI ends with /
        if (!rootURI.endsWith("/")) {
            rootURI += "/";
        }
        if (generation !== startupGeneration) return;

        var aomStartup = Components.classes["@mozilla.org/addons/addon-manager-startup;1"].getService(
            Components.interfaces.amIAddonManagerStartup,
        );
        var manifestURI = Services.io.newURI(rootURI + "manifest.json");
        chromeHandle = aomStartup.registerChrome(manifestURI, [
            ["content", "zoterocitation", rootURI + "chrome/content/"],
            ["locale", "zoterocitation", "en-US", rootURI + "locale/en-US/"],
            ["locale", "zoterocitation", "zh-CN", rootURI + "locale/zh-CN/"],
        ]);

        /**
         * Global variables for plugin code.
         * The `_globalThis` is the global root variable of the plugin sandbox environment
         * and all child variables assigned to it is globally accessible.
         * See `src/index.ts` for details.
         */
        const ctx = {
            rootURI,
        };
        ctx._globalThis = ctx;

        Services.scriptloader.loadSubScript(`${rootURI}chrome/content/scripts/index.js`, ctx);
    } catch (error) {
        Zotero?.logError?.("Failed to startup ZoteroCitation addon: " + error);
        // loadSubScript can fail after chrome registration. Release that
        // registration so a later enable/update does not inherit stale URLs.
        if (generation === startupGeneration && chromeHandle) {
            try {
                chromeHandle.destruct();
            } catch (cleanupError) {
                Zotero?.logError?.("Failed to release ZoteroCitation chrome: " + cleanupError);
            } finally {
                chromeHandle = null;
            }
        }
    }
}

async function shutdown({ id, version, resourceURI, rootURI }, reason) {
    ++startupGeneration;
    cancelZoteroWait?.();
    if (reason === APP_SHUTDOWN) {
        return;
    }
    try {
        if (reason === ADDON_DISABLE) {
            Services.obs.notifyObservers(null, "startupcache-invalidate", null);
        }
        if (typeof Zotero === "undefined") {
            Zotero = Components.classes["@zotero.org/Zotero;1"].getService(
                Components.interfaces.nsISupports,
            ).wrappedJSObject;
        }
        await Zotero.ZoteroCitation?.hooks?.onShutdown?.();
    } catch (error) {
        Zotero?.logError?.("Error during ZoteroCitation shutdown: " + error);
    }
    try {
        Cc["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).flushBundles();
    } catch (error) {
        Zotero?.logError?.("Failed to flush ZoteroCitation bundles: " + error);
    }
    try {
        const scriptRootURI = rootURI || resourceURI?.spec;
        if (scriptRootURI) {
            Cu.unload(`${scriptRootURI.endsWith("/") ? scriptRootURI : scriptRootURI + "/"}chrome/content/scripts/index.js`);
        }
    } catch (error) {
        Zotero?.logError?.("Failed to unload ZoteroCitation script: " + error);
    }
    if (chromeHandle) {
        try {
            chromeHandle.destruct();
        } catch (error) {
            Zotero?.logError?.("Failed to release ZoteroCitation chrome: " + error);
        } finally {
            chromeHandle = null;
        }
    }
}

function uninstall(data, reason) {}

// Loads default preferences from defaults/preferences/prefs.js in Zotero 6
function setDefaultPrefs(rootURI) {
    var branch = Services.prefs.getDefaultBranch("");
    var obj = {
        pref(pref, value) {
            switch (typeof value) {
                case "boolean":
                    branch.setBoolPref(pref, value);
                    break;
                case "string":
                    branch.setStringPref(pref, value);
                    break;
                case "number":
                    branch.setIntPref(pref, value);
                    break;
                default:
                    Zotero.logError(`Invalid type '${typeof value}' for pref '${pref}'`);
            }
        },
    };
    Zotero.getMainWindow().console.log(rootURI + "prefs.js");
    Services.scriptloader.loadSubScript(rootURI + "prefs.js", obj);
}
