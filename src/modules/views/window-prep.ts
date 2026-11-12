import { config } from "../../config.ts";
import type { NativeRuntime } from "../../runtime.ts";

interface Tree {
  _resetColumns(): Promise<void>;
}
interface ItemView {
  waitForLoad?(): Promise<void>;
  collectionTreeRows?: unknown[];
  _ensureSortContextReady?(): Promise<void>;
  _refreshPromise?: Promise<void>;
  _resetColumns?: (...args: unknown[]) => unknown;
  tree?: Tree;
  _columnsId?: string | null;
  forceUpdate(callback: () => void): void;
  [key: string]: unknown;
}
export interface WindowPrepContext {
  pane?: { itemsView?: ItemView };
  window?: { closed?: boolean };
  _disposed: boolean;
  _columnResetGuard?: boolean;
  _patchDisposers: Array<() => void>;
}
declare const addon: { data: { alive: boolean } };
declare const runtime: NativeRuntime;
const isStopped = (): boolean => addon.data.alive === false;

export class ViewsWindowPrep {
  async prepareWindow(this: WindowPrepContext): Promise<boolean> {
    for (let attempt = 0; !this.pane?.itemsView && attempt < 200; attempt++) {
      if (this._disposed || isStopped() || this.window?.closed) return false;
      await Zotero.Promise.delay(50);
    }
    if (this._disposed || isStopped() || this.window?.closed) return false;
    const itemsView = this.pane?.itemsView;
    if (!itemsView) {
      Zotero?.logError?.(new Error("Zotero item tree did not initialize"));
      return false;
    }
    await itemsView.waitForLoad?.();
    for (let attempt = 0; Array.isArray(itemsView.collectionTreeRows)
      && !itemsView.collectionTreeRows.length && attempt < 200; attempt++) {
      if (this._disposed || isStopped() || this.window?.closed) return false;
      await Zotero.Promise.delay(50);
    }
    if (Array.isArray(itemsView.collectionTreeRows) && !itemsView.collectionTreeRows.length) {
      Zotero?.logError?.(new Error("Zotero item tree collection context did not initialize"));
      return false;
    }
    await itemsView._ensureSortContextReady?.();
    await itemsView._refreshPromise;
    if (this._disposed || isStopped() || this.window?.closed) return false;
    if (this._columnResetGuard || typeof itemsView._resetColumns !== "function") return true;
    const restore = runtime.patch(itemsView, "_resetColumns", config.addonRef, original => function(this: unknown, ...args: unknown[]) {
      const view = this as ItemView;
      if (!view.tree) {
        view._columnsId = null;
        return new Promise<void>((resolve, reject) => view.forceUpdate(async () => {
          try { await view.tree?._resetColumns(); resolve(); }
          catch (error) { reject(error); }
        }));
      }
      return Reflect.apply(original, this, args);
    });
    this._columnResetGuard = true;
    this._patchDisposers.push(restore);
    return true;
  }
}
