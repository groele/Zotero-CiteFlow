import { config } from "./config.ts";
import Addon from "./addon.ts";

interface AddonInstance {
  data: { runtime: unknown };
  hooks: { onStartup(): Promise<void> };
}
interface Host {
  [key: string]: unknown;
  logError(error: unknown): void;
}
interface PluginGlobals {
  Zotero?: Host;
  addon?: AddonInstance;
  runtime?: unknown;
}
const globals = globalThis as unknown as PluginGlobals;
const host = globals.Zotero ?? ChromeUtils.importESModule("chrome://zotero/content/zotero.mjs").Zotero as unknown as Host;
globals.Zotero = host;
if (!host[config.addonInstance]) {
  const addon: AddonInstance = new Addon();
  globals.addon = addon;
  globals.runtime = addon.data.runtime;
  host[config.addonInstance] = addon;
  addon.hooks.onStartup().catch((error: unknown) => host.logError(error));
}
