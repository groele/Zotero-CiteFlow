import { config } from "../../config.mjs";
import { getString } from "../locale.mjs";
import { resolveWordDropTarget } from "../drop-target.mjs";

// ============================================================================
// Drag Citation & Word Target Interception
// ============================================================================

export class ViewsDragCite {
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
}
