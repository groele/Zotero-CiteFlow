import { config } from "../config.mjs";

const prefix = "extensions.zotero.zoterocitation.";
export const settings = [
  { id: "enable", key: "enable", defaultValue: true },
  { id: "quickCite", key: "quickCite.enable", defaultValue: true },
  { id: "dragCite", key: "dragCite.enable", defaultValue: true },
  { id: "citationTags", key: "citationTags.enable", defaultValue: true },
  { id: "citationTagText", key: "citationTags.text", defaultValue: "/Citations", maxLength: 200 },
  { id: "debug", key: "debug", defaultValue: false },
  { id: "citationTagDebounceMs", key: "citationTagDebounceMs", defaultValue: 150, min: 0, max: 2000 },
  { id: "itemsViewRefreshDebounceMs", key: "itemsViewRefreshDebounceMs", defaultValue: 120, min: 0, max: 2000 },
  { id: "healthWindowMs", key: "healthWindowMs", defaultValue: 300000, min: 10000, max: 3600000 },
  { id: "perfSlowThresholdMs", key: "perfSlowThresholdMs", defaultValue: 50, min: 5, max: 5000 }
];

export function readSetting(setting) {
  const value = Zotero.Prefs.get(prefix + setting.key, true);
  if (setting.maxLength !== undefined) {
    return typeof value === "string" && value.trim() && value.trim().length <= setting.maxLength && !/[\x00-\x1f\x7f]/.test(value)
      ? value.trim() : setting.defaultValue;
  }
  if (setting.min === undefined) return typeof value === "boolean" ? value : setting.defaultValue;
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) return setting.defaultValue;
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(setting.min, Math.min(setting.max, Math.trunc(number))) : setting.defaultValue;
}

export class Preferences {
  constructor(apply) {
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
      label: "CiteFlow",
      src: "chrome://zoterocitation/content/preferences.xhtml",
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
        Zotero.logError(error);
        if (this._disposed || revision !== this._revision) return;
        this._applyFailed = true;
      }
      for (const panel of this._panels.values()) panel.updateStatus();
    });
  }

  get settled() { return this._applyQueue; }

  init(win) {
    const root = win.document.getElementById("zoterocitation-settings");
    if (!root || this._disposed || this._panels.has(root)) return;
    const listeners = [];
    const invalid = new Map();
    const status = root.querySelector("#zoterocitation-settings-status");
    const updateStatus = () => {
      if (invalid.size) {
        const message = invalid.values().next().value;
        win.document.l10n.setAttributes(status, message.id, message.args);
        return;
      }
      win.document.l10n.setAttributes(status, this._applyFailed ? "zoterocitation-settings-apply-failed"
        : readSetting(settings[0]) !== this._startedEnabled ? "zoterocitation-settings-restart" : "zoterocitation-settings-saved");
    };
    const on = (node, type, handler) => {
      node.addEventListener(type, handler);
      listeners.push(() => node.removeEventListener(type, handler));
    };
    const sync = setting => {
      const input = root.querySelector(`#zoterocitation-setting-${setting.id}`);
      invalid.delete(setting.id);
      if (typeof setting.defaultValue === "boolean") input.checked = readSetting(setting);
      else { input.value = String(readSetting(setting)); input.setCustomValidity(""); }
      updateStatus();
    };
    const dispose = () => {
      for (const remove of listeners) remove();
      this._panels.delete(root);
    };
    this._panels.set(root, { sync, dispose, updateStatus });
    const save = values => {
      try {
        for (const [setting, value] of values) Zotero.Prefs.set(prefix + setting.key, value, true);
        updateStatus();
      } catch (error) {
        Zotero.logError(error);
        for (const setting of settings) sync(setting);
        // Cancel stale status updates; queued successful writes still apply.
        this._applyQueue = this._applyQueue.then(() => {
          if (!this._disposed && this._panels.has(root)) win.document.l10n.setAttributes(status, "zoterocitation-settings-save-failed");
        });
        win.document.l10n.setAttributes(status, "zoterocitation-settings-save-failed");
      }
    };
    for (const setting of settings) {
      const input = root.querySelector(`#zoterocitation-setting-${setting.id}`);
      sync(setting);
      if (typeof setting.defaultValue !== "boolean") on(input, "input", () => {
        input.setCustomValidity("");
        invalid.delete(setting.id);
        updateStatus();
      });
      on(input, "change", () => {
        let value = input.checked;
        if (setting.maxLength !== undefined) {
          value = input.value.trim();
          if (!value || value.length > setting.maxLength || /[\x00-\x1f\x7f]/.test(input.value)) {
            invalid.set(setting.id, { id: "zoterocitation-settings-invalid-tag" });
            updateStatus();
            input.reportValidity();
            return;
          }
        }
        if (setting.min !== undefined) {
          value = Number(input.value);
          if (!input.value.trim() || !Number.isInteger(value) || value < setting.min || value > setting.max) {
            input.reportValidity();
            invalid.set(setting.id, { id: "zoterocitation-settings-invalid", args: { min: setting.min, max: setting.max } });
            updateStatus();
            return;
          }
        }
        save([[setting, value]]);
      });
    }
    on(root.querySelector("#zoterocitation-settings-reset"), "click", () => {
      save(settings.map(setting => [setting, setting.defaultValue]));
      for (const setting of settings) sync(setting);
    });
    on(win, "unload", dispose);
  }

  dispose() {
    this._disposed = true;
    for (const panel of [...this._panels.values()]) panel.dispose();
    for (const symbol of this._observers) {
      try { Zotero.Prefs.unregisterObserver(symbol); } catch (error) { Zotero.logError(error); }
    }
    this._observers = [];
    if (this._paneID) Zotero.PreferencePanes.unregister(this._paneID);
    this._paneID = undefined;
  }
}
