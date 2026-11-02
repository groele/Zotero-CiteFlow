import { config } from "../config.mjs";
import { getString } from "./locale.mjs";
import { resolveWordDropTarget } from "./drop-target.mjs";

// ============================================================================
// Section 1: Views Coordinator Definition & Window State
// ============================================================================

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
    this._registeredColumnKeys = /* @__PURE__ */ new Set();
    this._iconNodeStates = /* @__PURE__ */ new Map();
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
   * Computes an indexed lookup cache from collection keys and item IDs to active sessions.
   * Invalidation is governed by api.sessionRevision.
   * @param {object} api - Coordinator API object
   * @returns {object} Indexed session cache
   * @private
   */
  _getSessionIndex(api) {
    const sessions = api.sessions || {};
    const revision = api.sessionRevision;
    if (Number.isSafeInteger(revision) && this._index?.sessions === sessions && this._index.revision === revision) {
      return this._index;
    }
    const index = { sessions, revision, byKey: new Map(), byItem: new Map() };
    for (const session of Object.values(sessions)) {
      const key = session?.collection?.key;
      if (key) {
        const matches = index.byKey.get(key) || [];
        matches.push(session);
        index.byKey.set(key, matches);
      }
      for (const id of Object.keys(session?.idData || {})) {
        const matches = index.byItem.get(Number(id)) || [];
        matches.push(session);
        index.byItem.set(Number(id), matches);
      }
    }
    this._index = index;
    return index;
  }

  /**
   * Resolves the formatted plain citation text for a library item.
   * Prioritizes selected collections, then active Word session, then unique item match.
   * @param {number|string} itemID - Zotero item ID
   * @returns {string} Formatted citation string or empty string
   */
  getCitationText(itemID) {
    try {
      const api = Zotero.ZoteroCitation?.api || {};
      const index = this._getSessionIndex(api);
      const pane = this.pane;
      const getSelected = pane?.getSelectedCollections || pane?.collectionsView?.getSelectedCollections;
      let selected = [];
      try {
        if (getSelected) selected = getSelected.call(pane.getSelectedCollections ? pane : pane.collectionsView) || [];
      } catch (error) {
        runtime.log("Cannot resolve citation collection selection", error);
      }
      const wordSessions = new Set();
      for (const collection of selected) {
        let candidates = index.byKey.get(collection?.key) || [];
        if (collection.libraryID == null && candidates.length !== 1) continue;
        if (collection.libraryID != null) {
          candidates = candidates.filter(session => session.collection.libraryID == null || session.collection.libraryID === collection.libraryID);
        }
        for (const session of candidates) wordSessions.add(session);
      }
      if (wordSessions.size) {
        const matches = [...wordSessions].filter(session => session.idData?.[itemID]);
        return matches.length === 1 ? matches[0].idData[itemID].plainCitation || "" : "";
      }
      const active = api.activeSessionID && index.sessions[api.activeSessionID]
        ? api.activeSessionID : Zotero.Integration.currentSession?.sessionID;
      if (active) return index.sessions[active]?.idData?.[itemID]?.plainCitation || "";
      const matches = index.byItem.get(Number(itemID)) || [];
      return matches.length === 1 ? matches[0].idData[itemID].plainCitation || "" : "";
    } catch (error) {
      runtime.log("Citation column lookup failed", error);
      return "";
    }
  }

  // ============================================================================
  // Section 2: Tree Column Registration & Lifecycle
  // ============================================================================

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
   * Retrieves column metadata from the active itemsView for CiteFlow keys.
   * @param {string} dataKey - Column data key
   * @returns {object|null} Column metadata or null
   */
  getColumnInfo(dataKey) {
    try {
      const columns = typeof this.pane.itemsView._getColumns === "function"
        ? this.pane.itemsView._getColumns()
        : typeof this.pane.itemsView.getColumns === "function" ? this.pane.itemsView.getColumns()
        : this.pane.itemsView._columns || [];
      const ownedKeys = new Set([
        dataKey,
        `${config.addonID}-${dataKey}`,
        `zoterocitation@polygon.org-${dataKey}`,
        ...(this._registeredColumnKeys || []),
        ...(addon.data.views?._registeredColumnKeys || [])
      ]);
      const columnInfo = columns.find((i) => typeof i?.dataKey === "string" && ownedKeys.has(i.dataKey));
      return columnInfo;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Section 3: Tree View Context Preparation & Empty-Library Guard
  // ============================================================================

  /**
   * Prepares the window itemsView by awaiting load, sort context, and patching _resetColumns.
   * @returns {Promise<void>}
   */
  async prepareWindow() {
    for (let attempt = 0; !this.pane?.itemsView && attempt < 200; attempt++) {
      if (this._disposed || addon.data.alive === false || this.window?.closed) return;
      await Zotero.Promise.delay(50);
    }
    if (this._disposed || addon.data.alive === false || this.window?.closed) return;
    const itemsView = this.pane?.itemsView;
    if (!itemsView) throw new Error("Zotero item tree did not initialize");
    await itemsView.waitForLoad?.();

    for (let attempt = 0; Array.isArray(itemsView.collectionTreeRows)
      && !itemsView.collectionTreeRows.length && attempt < 200; attempt++) {
      if (this._disposed || addon.data.alive === false || this.window?.closed) return;
      await Zotero.Promise.delay(50);
    }
    if (Array.isArray(itemsView.collectionTreeRows) && !itemsView.collectionTreeRows.length) {
      throw new Error("Zotero item tree collection context did not initialize");
    }
    await itemsView._ensureSortContextReady?.();
    await itemsView._refreshPromise;
    if (this._disposed || addon.data.alive === false || this.window?.closed) return;
    if (this._columnResetGuard || typeof itemsView._resetColumns !== "function") return;
    const restore = runtime.patch(itemsView, "_resetColumns", config.addonRef, original => function(...args) {
      if (!this.tree) {
        this._columnsId = null;
        return new Promise((resolve, reject) => this.forceUpdate(async () => {
          try { await this.tree?._resetColumns(); resolve(); }
          catch (error) { reject(error); }
        }));
      }
      return Reflect.apply(original, this, args);
    });
    this._columnResetGuard = true;
    this._patchDisposers.push(restore);
  }

  // ============================================================================
  // Section 4: Drag Citation & Word Target Interception
  // ============================================================================

  /**
   * Checks whether drag-to-cite feature is enabled and active.
   * @returns {boolean}
   * @private
   */
  _dragEnabled() {
    return !this._disposed && addon.data.alive !== false
      && Zotero.Prefs.get("extensions.zotero.zoterocitation.dragCite.enable", true) !== false;
  }

  /**
   * Probes the native process under cursor to determine if the target is Microsoft Word.
   * @returns {"word-confirmed"|"non-word"|"unknown"}
   * @private
   */
  _resolveDropTarget() {
    return resolveWordDropTarget();
  }

  /**
   * Displays a transient notice when a drop target cannot be confirmed as Word.
   * @private
   */
  _notifyUnknownDropTarget() {
    const now = Date.now();
    if (now - this._lastUnknownDropNotice < 15000) return;
    this._lastUnknownDropNotice = now;
    try {
      const notice = new Zotero.ProgressWindow();
      notice.changeHeadline(getString("drag-target-unknown"));
      notice.show();
      notice.startCloseTimer(5000);
    } catch (error) {
      Zotero.logError(error);
    }
  }

  /**
   * Installs drag-and-drop citation handler for Microsoft Word.
   * @returns {Promise<void>}
   */
  async dragCite() {
    if (this._dragEndHandler || this._disposed || addon.data.alive === false
      || Zotero.Prefs.get("extensions.zotero.zoterocitation.dragCite.enable", true) === false) return;
    this._dragEndHandler = (event) => {
      const items = this._dragItems;
      this._dragItems = null;
      if (!items?.length || !this._dragEnabled() || !event.dataTransfer
        || event.dataTransfer.mozUserCancelled) return;
      const target = this._resolveDropTarget();
      if (target === "unknown") this._notifyUnknownDropTarget();
      if (target !== "word-confirmed") return;
      void addon.api.citeItems(items).catch((error) => Zotero.logError(error));
    };
    this.document.addEventListener("dragend", this._dragEndHandler, true);
    try {
      const restore = runtime.patch(this.pane.itemsView, "onDragStart", config.addonRef,
        (original) => (event, row) => {
          this._dragItems = null;
          const selection = this.pane.itemsView.selection;
          if (this._dragEnabled() && Number.isInteger(row) && selection
            && !selection.isSelected(row)) selection.select(row);
          const items = this.pane.getSelectedItems();
          if (this._dragEnabled() && event.dataTransfer && items?.length
            && items.every((item) => item?.isRegularItem?.() && item.isTopLevelItem())) {
            this._dragItems = [...items];
            event.dataTransfer.setData("text/plain", "");
            return;
          }
          return original.call(this.pane.itemsView, event, row);
        });
      if (typeof restore === "function") (this._patchDisposers ??= []).push(restore);
    } catch (error) {
      this.document.removeEventListener("dragend", this._dragEndHandler, true);
      this._dragEndHandler = null;
      throw error;
    }
  }

  // ============================================================================
  // Section 5: Collection Icon Patching & Visual State Management
  // ============================================================================

  /**
   * Patches collectionsView.renderItem to display the Word icon for CiteFlow temporary collections.
   * @returns {Promise<void>}
   */
  async patchIcon() {
    try {
      const view = this;
      const restore = runtime.patch(
        this.pane.collectionsView,
        "renderItem",
        config.addonRef,
        (original) => (index, selection, oldDiv, columns) => {
          const previousIcon = oldDiv?.querySelector?.(".cell-icon");
          if (previousIcon) {
            view._restoreIconNode(previousIcon);
            view._iconNodeStates?.delete(previousIcon);
          }
          const div = original.call(this.pane.collectionsView, index, selection, oldDiv, columns);
          if (view._disposed || addon.data.alive === false) return div;
          const row = this.pane.collectionsView.getRow(index);
          const rowRef = row?.ref;
          const candidates = this._getSessionIndex(Zotero.ZoteroCitation?.api || {}).byKey.get(rowRef?.key) || [];
          const isCitationCollection = candidates.some(session => session.collection.libraryID == null || rowRef?.libraryID == null || session.collection.libraryID === rowRef.libraryID);
          const iconNode = div?.querySelector?.(".cell-icon");
          if (iconNode && isCitationCollection) {
            view._rememberIconNode(iconNode);
            iconNode.style.backgroundImage = `url(chrome://${config.addonRef}/content/icons/word.png)`;
            iconNode.classList.remove("icon-search", "icon-collection");
            iconNode.classList.add("icon-publications");
          } else if (iconNode) {
            view._restoreIconNode(iconNode);
            view._iconNodeStates?.delete(iconNode);
          }
          return div;
        }
      );
      if (typeof restore === "function") (this._patchDisposers ??= []).push(restore);
    } catch (error) {
      runtime.log("[Views] Failed to patch citation collection icon:", error);
    }
  }

  /**
   * Caches original visual properties of an icon DOM node before patching.
   * @param {Element} iconNode - Cell icon element
   * @private
   */
  _rememberIconNode(iconNode) {
    this._iconNodeStates ??= new Map();
    for (const node of this._iconNodeStates.keys()) {
      if (node.isConnected === false) this._iconNodeStates.delete(node);
    }
    if (this._iconNodeStates.has(iconNode)) {
      return;
    }
    this._iconNodeStates.set(iconNode, {
      backgroundImage: iconNode.style?.backgroundImage || "",
      hadSearch: iconNode.classList?.contains("icon-search") === true,
      hadCollection: iconNode.classList?.contains("icon-collection") === true,
      hadPublications: iconNode.classList?.contains("icon-publications") === true
    });
  }

  /**
   * Restores an icon node to its pre-patch visual state.
   * @param {Element} iconNode - Cell icon element
   * @param {object} [state] - Cached visual state
   * @private
   */
  _restoreIconNode(iconNode, state = this._iconNodeStates?.get(iconNode)) {
    if (!iconNode || !state) {
      return;
    }
    if (String(iconNode.style?.backgroundImage || "").includes(`/content/icons/word.png`)) {
      iconNode.style.backgroundImage = state.backgroundImage;
    }
    if (iconNode.classList) {
      if (state.hadSearch) iconNode.classList.add("icon-search");
      else iconNode.classList.remove("icon-search");
      if (state.hadCollection) iconNode.classList.add("icon-collection");
      else iconNode.classList.remove("icon-collection");
      if (state.hadPublications) iconNode.classList.add("icon-publications");
      else iconNode.classList.remove("icon-publications");
    }
  }

  // ============================================================================
  // Section 6: Cleanup & Teardown
  // ============================================================================

  /**
   * Disposes the view coordinator, listeners, patched nodes, and registered columns.
   * @returns {Promise<void>}
   */
  dispose() {
    this._disposed = true;
    this._dragItems = null;
    const cleanup = action => {
      try { action(); } catch (error) { Zotero.logError(error); }
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

export default Views;
