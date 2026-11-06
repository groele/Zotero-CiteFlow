import { config } from "../../config.ts";
import { getString } from "../locale.ts";
import { resolveWordDropTarget } from "../drop-target.ts";

import type { NativeRuntime } from "../../runtime.ts";
export interface CiteItem { id?: number; deleted?: boolean; inTrash?: boolean; isRegularItem?(): boolean; isTopLevelItem(): boolean }
interface DragSelection { isSelected(row: number): boolean; select(row: number): void }
interface ItemsView { selection?: DragSelection; [key: string]: unknown }
interface DragPane { itemsView: ItemsView; getSelectedItems?(): CiteItem[] }
export interface DragContext {
  _disposed: boolean; _lastUnknownDropNotice: number; _dragEndHandler?: ((event: DragEvent) => void) | null;
  _dragItems?: CiteItem[] | null; _dragStartedAt?: number; _dragDocument?: Document | null;
  _patchDisposers: Array<() => void>; document: Document; pane: DragPane;
  _dragEnabled(): boolean; _resolveDropTarget(): string; _notifyUnknownDropTarget(): void;
}
declare const addon: { data: { alive: boolean }; api: { citeItems(items: CiteItem[]): Promise<void> } };
declare const runtime: NativeRuntime;
// ============================================================================
// Drag Citation & Word Target Interception
// ============================================================================

export class ViewsDragCite {
  /**
   * Checks whether drag-to-cite feature is enabled and active.
   * @returns {boolean}
   * @private
   */
  _dragEnabled(this: DragContext): boolean {
    return !this._disposed && addon.data.alive !== false
      && Zotero.Prefs.get("extensions.zotero.zoterocitation.dragCite.enable", true) !== false;
  }

  /**
   * Probes the native process under cursor to determine if the target is Microsoft Word.
   * @returns {"word-confirmed"|"non-word"|"unknown"}
   * @private
   */
  _resolveDropTarget(): string {
    return resolveWordDropTarget();
  }

  /**
   * Displays a transient notice when a drop target cannot be confirmed as Word.
   * @private
   */
  _notifyUnknownDropTarget(this: DragContext): void {
    const now = Date.now();
    if (now - this._lastUnknownDropNotice < 15000) return;
    this._lastUnknownDropNotice = now;
    try {
      const notice = new Zotero.ProgressWindow();
      notice.changeHeadline(getString("drag-target-unknown"));
      notice.show();
      notice.startCloseTimer(5000);
    } catch (error) {
      Zotero.logError(error as Error);
    }
  }

  /**
   * Installs drag-and-drop citation handler for Microsoft Word.
   * @returns {Promise<void>}
   */
  async dragCite(this: DragContext): Promise<void> {
    if (this._dragEndHandler || this._disposed || addon.data.alive === false
      || Zotero.Prefs.get("extensions.zotero.zoterocitation.dragCite.enable", true) === false) return;
    this._dragEndHandler = (event: DragEvent) => {
      const items = this._dragItems;
      const startedAt = this._dragStartedAt || 0;
      this._dragItems = null;
      this._dragStartedAt = 0;
      if (!items?.length || !this._dragEnabled() || !event.dataTransfer
        || (event.dataTransfer as DataTransfer & { mozUserCancelled?: boolean }).mozUserCancelled) return;
      if (startedAt > 0 && Date.now() - startedAt > 60000) return;
      const target = this._resolveDropTarget();
      if (target === "unknown") this._notifyUnknownDropTarget();
      if (target !== "word-confirmed") return;
      const validItems = items.filter((item) => item && item.deleted !== true && item.inTrash !== true
        && item.isRegularItem?.() && item.isTopLevelItem()
        && Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0);
      if (!validItems.length) return;
      void addon.api.citeItems(validItems).catch((error) => Zotero.logError(error));
    };
    const dragDoc = this.document;
    this._dragDocument = dragDoc;
    dragDoc.addEventListener("dragend", this._dragEndHandler, true);
    try {
      const restore = runtime.patch(this.pane.itemsView, "onDragStart", config.addonRef,
        (original) => (...args: unknown[]) => {
          const event = args[0] as DragEvent;
          const row = args[1] as number;
          this._dragItems = null;
          this._dragStartedAt = 0;
          const selection = this.pane.itemsView.selection;
          if (this._dragEnabled() && Number.isInteger(row) && selection
            && !selection.isSelected(row)) selection.select(row);
          const items = this.pane?.getSelectedItems?.();
          if (this._dragEnabled() && event.dataTransfer && items?.length
            && items.every((item) => item && item.deleted !== true && item.inTrash !== true
              && item.isRegularItem?.() && item.isTopLevelItem())) {
            const seenIDs = new Set<number>();
            this._dragItems = items.filter((item) => {
              if (item.id != null) {
                if (seenIDs.has(item.id)) return false;
                seenIDs.add(item.id);
              }
              return true;
            });
            this._dragStartedAt = Date.now();
            event.dataTransfer.setData("text/plain", "");
            return;
          }
          return original.call(this.pane.itemsView, event, row);
        });
      if (typeof restore === "function") (this._patchDisposers ??= []).push(restore);
    } catch (error) {
      dragDoc.removeEventListener("dragend", this._dragEndHandler, true);
      this._dragDocument = null;
      this._dragEndHandler = null;
      throw error;
    }
  }
}
