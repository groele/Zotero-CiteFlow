import { config } from "../../config.mjs";

// ============================================================================
// Tree View Context Preparation & Empty-Library Guard
// ============================================================================

export class ViewsWindowPrep {
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
}
