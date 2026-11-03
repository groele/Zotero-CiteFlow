import { config } from "../config.mjs";
import { getString } from "./locale.mjs";
import { ViewsSessionIndex } from "./views/session-index.mjs";
import { ViewsColumnManager } from "./views/column-manager.mjs";
import { ViewsWindowPrep } from "./views/window-prep.mjs";
import { ViewsDragCite } from "./views/drag-cite.mjs";
import { ViewsIconPatch } from "./views/icon-patch.mjs";

var VIEWS_DOMAIN_MODULES = [
  typeof ViewsSessionIndex !== "undefined" && ViewsSessionIndex,
  typeof ViewsColumnManager !== "undefined" && ViewsColumnManager,
  typeof ViewsWindowPrep !== "undefined" && ViewsWindowPrep,
  typeof ViewsDragCite !== "undefined" && ViewsDragCite,
  typeof ViewsIconPatch !== "undefined" && ViewsIconPatch
].filter(Boolean);

var Views = class {
  /**
   * Initializes view coordinator for a Zotero window.
   * @param {Window|null} [win=null] - Optional specific window instance
   */
  constructor(win = null) {
    this._window = win;
    this._patchDisposers = [];
    this._disposed = false;
    this._dragItems = null;
    this._dragEndHandler = null;
    this._lastUnknownDropNotice = 0;
    this._registeredColumnKeys = new Set();
    this._iconNodeStates = new Map();
  }

  /**
   * Resolves the active ZoteroPane instance.
   * @type {object}
   */
  get pane() {
    return this._window?.ZoteroPane ?? Zotero.getActiveZoteroPane?.() ?? globalThis.ZoteroPane;
  }

  /**
   * Resolves the active document instance.
   * @type {Document}
   */
  get document() {
    return this._window?.document ?? globalThis.document;
  }

  /**
   * Resolves the active window instance.
   * @type {Window}
   */
  get window() {
    return this._window ?? Zotero.getMainWindow?.() ?? globalThis.window;
  }

  /**
   * Registers the "citation" column with Zotero.ItemTreeManager.
   * @returns {Promise<void>}
   */
  async createCitationColumn() {
    if (this._disposed) {
      return;
    }
    const key = "citation";
    const registered = await Zotero.ItemTreeManager.registerColumns({
      dataKey: key,
      label: getString(`column-${key}`),
      zoteroPersist: ["width", "hidden", "sortDirection"],
      dataProvider: item => this.getCitationText(item.id),
      renderCell: (index, data, column, isFirstColumn, doc = this.document) => {
        const span = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
        span.style.pointerEvents = "auto";
        if (!column) {
          return span;
        }
        span.className = `cell ${column.className}`;
        if (data == "") {
          return span;
        } else {
          span.innerText = data ?? "";
          return span;
        }
      },
      pluginID: config.addonID
    });
    const registeredKeys = Array.isArray(registered) ? registered : [registered];
    for (const registeredKey of registeredKeys) {
      if (typeof registeredKey === "string" && registeredKey) {
        this._registeredColumnKeys ??= new Set();
        this._registeredColumnKeys.add(registeredKey);
      }
    }
    if (this._disposed || addon.data.alive === false) {
      await this._unregisterCitationColumns();
    }
  }

  /**
   * Unregisters all tracked citation columns asynchronously.
   * @returns {Promise<void>}
   * @private
   */
  async _unregisterCitationColumns() {
    const keys = [...(this._registeredColumnKeys || [])];
    this._registeredColumnKeys?.clear();
    if (!keys.length) return this._columnCleanup;
    const previous = this._columnCleanup;
    this._columnCleanup = (async () => {
      if (previous) await previous;
      try {
        const manager = Zotero.ItemTreeManager;
        if (typeof manager.unregisterColumns === "function") await manager.unregisterColumns(keys);
        else if (typeof manager.unregisterColumn === "function") await Promise.all(keys.map(key => manager.unregisterColumn(key)));
      } catch (error) {
        Zotero.logError(error);
      }
    })();
    return this._columnCleanup;
  }

  /**
   * Disposes the view coordinator, listeners, patched nodes, and registered columns.
   * @returns {Promise<void>}
   */
  dispose() {
    this._disposed = true;
    this._dragItems = null;
    const cleanup = action => {
      try { action(); } catch (error) { (Zotero?.logError || runtime?.log || console.error)(error); }
    };
    if (this._dragEndHandler) cleanup(() => this.document.removeEventListener("dragend", this._dragEndHandler, true));
    this._dragEndHandler = null;
    for (const [iconNode, state] of this._iconNodeStates || []) {
      cleanup(() => this._restoreIconNode(iconNode, state));
    }
    this._iconNodeStates?.clear();
    this._index = null;
    for (const restore of this._patchDisposers || []) cleanup(restore);
    this._patchDisposers = [];
    const pending = this._unregisterCitationColumns();
    this._window = null;
    return pending;
  }
};

for (const DomainClass of VIEWS_DOMAIN_MODULES) {
  const descriptors = Object.getOwnPropertyDescriptors(DomainClass.prototype);
  delete descriptors.constructor;
  Object.defineProperties(Views.prototype, descriptors);
}

export default Views;
