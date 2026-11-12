import { config } from "../config.ts";
import { supportsNativeDropTarget } from "./drop-target.ts";

declare const __buildVersion__: string | undefined;
declare const __buildDate__: string | undefined;
const buildVersion = typeof __buildVersion__ === "string" ? __buildVersion__ : "";
const buildDate = typeof __buildDate__ === "string" ? __buildDate__ : "";

interface Setting { id: string; key: string; defaultValue: boolean | string | number; maxLength?: number; min?: number; max?: number }
interface StatusMessage { id: string; args?: Record<string, string | number> }
interface PreferencePanel { sync(setting: Setting): void; dispose(): void; updateStatus(): void }
type PreferencesWindow = Window & { document: Document & { l10n: { setAttributes(element: Element | null, id: string, args?: StatusMessage["args"]): void } } };
type PreferenceValue = boolean | string | number;
const prefix = "extensions.zotero.zoterocitation.";
export const settings: Setting[] = [
  { id: "enable", key: "enable", defaultValue: true },
  { id: "dragCite", key: "dragCite.enable", defaultValue: true },
  { id: "collections", key: "collections.enable", defaultValue: true },
  { id: "citationTags", key: "citationTags.enable", defaultValue: true },
  { id: "citationTagText", key: "citationTags.text", defaultValue: "/Citations", maxLength: 200 },
  { id: "debug", key: "debug", defaultValue: false },
  { id: "citationTagDebounceMs", key: "citationTagDebounceMs", defaultValue: 150, min: 0, max: 2000 },
  { id: "itemsViewRefreshDebounceMs", key: "itemsViewRefreshDebounceMs", defaultValue: 120, min: 0, max: 2000 },
  { id: "healthWindowMs", key: "healthWindowMs", defaultValue: 300000, min: 10000, max: 3600000 },
  { id: "perfSlowThresholdMs", key: "perfSlowThresholdMs", defaultValue: 50, min: 5, max: 5000 }
];

export function readSetting(setting: Setting): PreferenceValue {
  const value = Zotero.Prefs.get(prefix + setting.key, true);
  if (setting.maxLength !== undefined) {
    return typeof value === "string" && value.trim() && value.trim().length <= setting.maxLength && !/[\x00-\x1f\x7f]/.test(value)
      ? value.trim() : setting.defaultValue;
  }
  if (setting.min === undefined) return typeof value === "boolean" ? value : setting.defaultValue;
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) return setting.defaultValue;
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(setting.min, Math.min(setting.max!, Math.trunc(number))) : setting.defaultValue;
}

export class Preferences {
  private readonly _apply: () => Promise<{ complete?: boolean } | undefined>;
  private readonly _panels: Map<Element, PreferencePanel>;
  private _observers: Array<ReturnType<typeof Zotero.Prefs.registerObserver>>;
  private _disposed: boolean;
  private _applyQueue: Promise<void>;
  private _revision: number;
  private _applyFailed: boolean;
  private _startedEnabled: PreferenceValue;
  private _paneID?: string;

  constructor(apply: () => Promise<{ complete?: boolean } | undefined>) {
    this._apply = apply;
    this._panels = new Map();
    this._observers = [];
    this._disposed = false;
    this._applyQueue = Promise.resolve();
    this._revision = 0;
    this._applyFailed = false;
    this._startedEnabled = readSetting(settings[0]);
  }

  async register() {
    this._paneID = await Zotero.PreferencePanes.register({
      pluginID: config.addonID,
      id: "zoterocitation-preferences",
      label: config.addonName,
      src: "chrome://zoterocitation/content/preferences.xhtml",
      scripts: ["chrome://zoterocitation/content/preferences.js"],
      defaultXUL: true,
      stylesheets: ["chrome://zoterocitation/content/preferences.css"]
    });
    if (this._disposed) {
      Zotero.PreferencePanes.unregister(this._paneID);
      this._paneID = undefined;
      return;
    }
    for (const setting of settings) {
      const symbol = Zotero.Prefs.registerObserver(prefix + setting.key, () => {
        if (this._disposed) return;
        for (const panel of this._panels.values()) panel.sync(setting);
        // Read values on every change, including changes made in Config Editor.
        this._scheduleApply();
      }, true);
      this._observers.push(symbol);
    }
  }

  _scheduleApply() {
    const revision = ++this._revision;
    this._applyQueue = this._applyQueue.catch(error => Zotero.logError(error)).then(async () => {
      if (this._disposed || revision !== this._revision) return;
      try {
        const result = await this._apply();
        if (this._disposed || revision !== this._revision) return;
        this._applyFailed = result?.complete === false;
      } catch (error) {
        Zotero.logError(error as Error);
        if (this._disposed || revision !== this._revision) return;
        this._applyFailed = true;
      }
      for (const panel of this._panels.values()) panel.updateStatus();
    });
  }

  get settled() { return this._applyQueue; }

  init(win: PreferencesWindow): void {
    const root = win.document.getElementById("zoterocitation-settings");
    if (!root || this._disposed || this._panels.has(root)) return;
    // Create the signal in the owning window's realm for its native DOM nodes.
    const AbortControllerForWindow = (win as unknown as { AbortController: typeof AbortController }).AbortController;
    const controller = new AbortControllerForWindow();
    const invalid = new Map<string, StatusMessage>();
    const status = root.querySelector("#zoterocitation-settings-status");
    const updateStatus = () => {
      if (invalid.size) {
        const message = invalid.values().next().value!;
        win.document.l10n.setAttributes(status, message.id, message.args);
        return;
      }
      win.document.l10n.setAttributes(status, this._applyFailed ? "zoterocitation-settings-apply-failed"
        : readSetting(settings[0]) !== this._startedEnabled ? "zoterocitation-settings-restart" : "zoterocitation-settings-saved");
    };
    const badge = root.querySelector(".zoterocitation-version-badge");
    if (badge && buildVersion) badge.textContent = `v${buildVersion}`;
    const dateNode = root.querySelector(".zoterocitation-version-info time");
    if (dateNode && buildDate) {
      dateNode.setAttribute("datetime", buildDate);
      dateNode.textContent = buildDate;
    }
    const packageLink = root.querySelector<HTMLAnchorElement>('[data-l10n-id="zoterocitation-settings-package-link"]');
    if (packageLink && buildVersion) {
      packageLink.setAttribute(
        "href",
        `https://github.com/groele/Zotero-CiteFlow/releases/download/v${buildVersion}/zotero-citeflow-${buildVersion}.xpi`
      );
      win.document.l10n?.setAttributes?.(packageLink, "zoterocitation-settings-package-link", { version: buildVersion });
    }
    const tagTextSetting = settings.find(setting => setting.id === "citationTagText")!;
    const dragSupported = supportsNativeDropTarget();
    const updateDependencies = () => {
      const tagsEnabled = root.querySelector<HTMLInputElement>("#zoterocitation-setting-citationTags")?.checked;
      const tagTextInput = root.querySelector<HTMLInputElement>("#zoterocitation-setting-citationTagText");
      if (tagTextInput) {
        tagTextInput.disabled = !tagsEnabled;
        if (!tagsEnabled) {
          tagTextInput.setCustomValidity("");
          const hadInvalid = invalid.delete("citationTagText");
          if (hadInvalid) {
            tagTextInput.value = String(readSetting(tagTextSetting));
            updateStatus();
          }
        }
      }
      const tagTextRow = typeof tagTextInput?.closest === "function" ? tagTextInput.closest(".zoterocitation-number-row") : null;
      if (tagTextRow?.classList) tagTextRow.classList.toggle("is-disabled", !tagsEnabled);
      const dragInput = root.querySelector<HTMLInputElement>("#zoterocitation-setting-dragCite");
      if (dragInput) dragInput.disabled = !dragSupported;
      const dragRow = typeof dragInput?.closest === "function" ? dragInput.closest(".zoterocitation-option") : null;
      if (dragRow?.classList) dragRow.classList.toggle("is-disabled", !dragSupported);
    };
    const on = (node: EventTarget, type: string, handler: EventListener) => {
      node.addEventListener(type, handler, { signal: controller.signal });
    };
    const sync = (setting: Setting): void => {
      const input = root.querySelector<HTMLInputElement>(`#zoterocitation-setting-${setting.id}`)!;
      invalid.delete(setting.id);
      if (typeof setting.defaultValue === "boolean") input.checked = readSetting(setting) as boolean;
      else { input.value = String(readSetting(setting)); input.setCustomValidity(""); }
      updateStatus();
      updateDependencies();
    };
    const dispose = () => {
      controller.abort();
      this._panels.delete(root);
    };
    this._panels.set(root, { sync, dispose, updateStatus });
    const save = (values: Array<[Setting, PreferenceValue]>): void => {
      try {
        for (const [setting, value] of values) Zotero.Prefs.set(prefix + setting.key, value, true);
        updateStatus();
      } catch (error) {
        Zotero.logError(error as Error);
        for (const setting of settings) sync(setting);
        // Cancel stale status updates; queued successful writes still apply.
        this._applyQueue = this._applyQueue.then(() => {
          if (!this._disposed && this._panels.has(root)) win.document.l10n.setAttributes(status, "zoterocitation-settings-save-failed");
        });
        win.document.l10n.setAttributes(status, "zoterocitation-settings-save-failed");
      }
    };
    for (const setting of settings) {
      const input = root.querySelector<HTMLInputElement>(`#zoterocitation-setting-${setting.id}`)!;
      sync(setting);
      if (typeof setting.defaultValue !== "boolean") on(input, "input", () => {
        input.setCustomValidity("");
        invalid.delete(setting.id);
        updateStatus();
      });
      on(input, "change", () => {
        let value: PreferenceValue = input.checked;
        if (setting.maxLength !== undefined) {
          value = input.value.trim();
          if (!value || (value as string).length > setting.maxLength || /[\x00-\x1f\x7f]/.test(input.value)) {
            invalid.set(setting.id, { id: "zoterocitation-settings-invalid-tag" });
            updateStatus();
            input.reportValidity();
            return;
          }
        }
        if (setting.min !== undefined) {
          value = Number(input.value);
          if (!input.value.trim() || !Number.isInteger(value) || value < setting.min || value > setting.max!) {
            input.reportValidity();
            invalid.set(setting.id, { id: "zoterocitation-settings-invalid", args: { min: setting.min, max: setting.max! } });
            updateStatus();
            return;
          }
        }
        save([[setting, value]]);
        updateDependencies();
      });
    }
    on(root.querySelector("#zoterocitation-settings-reset")!, "click", () => {
      save(settings.map(setting => [setting, setting.defaultValue]));
      for (const setting of settings) sync(setting);
      updateDependencies();
    });
    on(win, "unload", dispose);
  }

  dispose() {
    this._disposed = true;
    for (const panel of [...this._panels.values()]) panel.dispose();
    for (const symbol of this._observers) {
      try { Zotero.Prefs.unregisterObserver(symbol); } catch (error) { Zotero.logError(error as Error); }
    }
    this._observers = [];
    if (this._paneID) Zotero.PreferencePanes.unregister(this._paneID);
    this._paneID = undefined;
  }
}
