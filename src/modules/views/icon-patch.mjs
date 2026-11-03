import { config } from "../../config.mjs";

// ============================================================================
// Collection Icon Patching & Visual State Management
// ============================================================================

export class ViewsIconPatch {
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
}
