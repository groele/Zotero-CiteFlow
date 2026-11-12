import { config } from "../config.ts";
import { getString } from "./locale.ts";
import { ViewsSessionIndex } from "./views/session-index.ts";
import { ViewsColumnManager } from "./views/column-manager.ts";
import { ViewsWindowPrep } from "./views/window-prep.ts";
import { ViewsDragCite } from "./views/drag-cite.ts";
import { ViewsIconPatch } from "./views/icon-patch.ts";
import { composeDomains } from "./domain-composition.ts";

import type { SessionContext, SessionIndex } from "./views/session-index.ts";
import type { ColumnContext } from "./views/column-manager.ts";
import type { WindowPrepContext } from "./views/window-prep.ts";
import type { DragContext, CiteItem } from "./views/drag-cite.ts";
type ViewPane = NonNullable<SessionContext["pane"]> & ColumnContext["pane"] & DragContext["pane"] & NonNullable<WindowPrepContext["pane"]>;
type ViewWindow = Window & { ZoteroPane?: ViewPane };
interface IconState { backgroundImage: string; hadSearch: boolean; hadCollection: boolean; hadPublications: boolean }
interface ViewGlobals { ZoteroPane?: ViewPane; document?: Document; window?: ViewWindow }
declare const addon: { data: { alive: boolean } };
declare const runtime: { log(error: unknown): void };
const globals = globalThis as unknown as ViewGlobals;

const VIEWS_DOMAIN_MODULES = [ViewsSessionIndex, ViewsColumnManager, ViewsWindowPrep, ViewsDragCite, ViewsIconPatch];

interface Views extends ViewsSessionIndex, ViewsColumnManager, ViewsWindowPrep, ViewsDragCite {
  _restoreIconNode(node: HTMLElement, state: IconState): void;
  patchIcon(): Promise<void>;
}
class Views {
  _window: ViewWindow | null;
  _patchDisposers: Array<() => void>;
  _disposed: boolean;
  _dragItems: CiteItem[] | null;
  _dragEndHandler: ((event: DragEvent) => void) | null;
  _dragDocument: Document | null = null;
  _lastUnknownDropNotice: number;
  _registeredColumnKeys: Set<string>;
  _iconNodeStates: Map<HTMLElement, IconState>;
  _index: SessionIndex | null = null;
  _columnCleanup?: Promise<void>;

  /**
   * Initializes view coordinator for a Zotero window.
   * @param {Window|null} [win=null] - Optional specific window instance
   */
  constructor(win: ViewWindow | null = null) {
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
  get pane(): ViewPane {
    return (this._window?.ZoteroPane ?? Zotero.getActiveZoteroPane?.() ?? globals.ZoteroPane) as unknown as ViewPane;
  }

  /**
   * Resolves the active document instance.
   * @type {Document}
   */
  get document(): Document {
    return this._window?.document ?? Zotero.getMainWindow?.()?.document ?? globals.document as Document;
  }

  /**
   * Resolves the active window instance.
   * @type {Window}
   */
  get window(): ViewWindow {
    return (this._window ?? Zotero.getMainWindow?.() ?? globals.window) as unknown as ViewWindow;
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
      enabledTreeIDs: ["main"],
      zoteroPersist: ["width", "hidden", "sortDirection"],
      dataProvider: item => this.getCitationText(item.id),
      renderCell: (index, data, column, isFirstColumn, doc = this.document) => {
        const span = doc.createElementNS("http://www.w3.org/1999/xhtml", "span") as HTMLSpanElement;
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
        Zotero.logError(error as Error);
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
    const cleanup = (action: () => void): void => {
      try { action(); } catch (error) { (Zotero?.logError || runtime?.log || console.error)(error as Error); }
    };
    if (this._dragEndHandler) cleanup(() => (this._dragDocument || this.document)?.removeEventListener("dragend", this._dragEndHandler!, true));
    this._dragDocument = null;
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
}

composeDomains(Views.prototype, VIEWS_DOMAIN_MODULES);

export default Views;
