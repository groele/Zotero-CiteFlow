import { config } from "./config.mjs";
import Addon from "./addon.mjs";

globalThis.Zotero ??= ChromeUtils.importESModule("chrome://zotero/content/zotero.mjs").Zotero;
if (!Zotero[config.addonInstance]) {
  globalThis.addon = new Addon();
  globalThis.runtime = addon.data.runtime;
  Zotero[config.addonInstance] = addon;
  addon.hooks.onStartup().catch(error => Zotero.logError(error));
}
