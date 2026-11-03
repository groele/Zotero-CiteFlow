import { config } from "../../config.mjs";

// ============================================================================
// Collection Icon Patching, Positioning Above My Publications & Visual State
// ============================================================================

const TEMP_COLLECTION_RELATION = "dc:relation";
const TEMP_COLLECTION_MARKERS = new Set([
  "https://github.com/groele/Zotero-CiteFlow#temporary-collection",
  "https://github.com/MuiseDestiny/zotero-citation#temporary-collection"
]);

export class ViewsIconPatch {
  /**
   * Determines whether a Zotero collection reference is a CiteFlow temporary Word collection.
   * @private
   */
  _isCitationCollection(rowRef) {
    if (!rowRef || typeof rowRef !== "object") return false;
    if (rowRef._isCiteFlowCollection === true) return true;
    const key = rowRef.key;
    if (typeof key === "string" && key) {
      if (addon?.data?.citation?._temporaryCollectionKeys?.has?.(key)) return true;
      const candidates = this._getSessionIndex?.(Zotero.ZoteroCitation?.api || {})?.byKey?.get?.(key) || [];
      if (candidates.some(s => s?.collection?.libraryID == null || rowRef.libraryID == null || s.collection.libraryID === rowRef.libraryID)) {
        return true;
      }
    }
    try {
      const relations = rowRef.getRelationsByPredicate?.(TEMP_COLLECTION_RELATION) || [];
      if (Array.isArray(relations) && relations.some(rel => TEMP_COLLECTION_MARKERS.has(rel))) return true;
    } catch {}
    return false;
  }

  /**
   * Checks whether a CollectionTreeRow is a bottom virtual library row (starting at My Publications).
   * @private
   */
  _isBottomVirtualRow(treeRow) {
    if (!treeRow || typeof treeRow !== "object") return false;
    const t = treeRow.type;
    return t === "publications" || t === "duplicates" || t === "unfiled" || t === "retracted" || t === "trash"
      || Boolean(treeRow.isPublications?.() || treeRow.isDuplicates?.() || treeRow.isUnfiled?.() || treeRow.isRetracted?.() || treeRow.isTrash?.());
  }

  /**
   * Compares two collection names using Zotero's locale collator.
   * @private
   */
  _compareCollectionNames(nameA, nameB) {
    const a = String(nameA ?? ""), b = String(nameB ?? "");
    return typeof Zotero?.localeCompare === "function" ? Zotero.localeCompare(a, b) : a.localeCompare(b);
  }

  /**
   * Reorders CiteFlow temporary Word collection rows within a library slice so they appear
   * after all regular user collections/searches and immediately above My Publications.
   * @private
   */
  _reorderCitationRowsInSlice(rows, startIndex, endIndex, targetLevel) {
    if (!Array.isArray(rows) || startIndex < 0 || endIndex <= startIndex || endIndex > rows.length) return false;
    const beforeBlocks = [], citationBlocks = [], afterBlocks = [];
    let i = startIndex, reachedBottomVirtual = false;

    while (i < endIndex) {
      const head = rows[i], block = [head];
      i += 1;
      while (i < endIndex && (rows[i]?.level ?? targetLevel) > targetLevel) {
        block.push(rows[i]);
        i += 1;
      }
      const isCitation = Boolean((head?.isCollection?.() || head?.type === "collection") && this._isCitationCollection(head?.ref));
      if (isCitation) citationBlocks.push(block);
      else if (reachedBottomVirtual || this._isBottomVirtualRow(head)) {
        reachedBottomVirtual = true;
        afterBlocks.push(block);
      } else beforeBlocks.push(block);
    }

    if (!citationBlocks.length) return false;
    citationBlocks.sort((a, b) => this._compareCollectionNames(a[0]?.ref?.name, b[0]?.ref?.name));
    const reordered = [...beforeBlocks.flat(), ...citationBlocks.flat(), ...afterBlocks.flat()];
    if (reordered.length !== endIndex - startIndex) return false;

    let changed = false;
    for (let k = 0; k < reordered.length; k++) {
      if (rows[startIndex + k] !== reordered[k]) { changed = true; break; }
    }
    if (!changed) return false;
    rows.splice(startIndex, endIndex - startIndex, ...reordered);
    return true;
  }

  /**
   * Enumerates all unique active collectionsView instances across main and detached windows.
   * @private
   */
  _getAllCollectionsViews() {
    const views = new Set([this.pane?.collectionsView].filter(Boolean));
    if (typeof Zotero?.getMainWindows === "function") {
      for (const win of Zotero.getMainWindows()) {
        const cv = win?.ZoteroPane?.collectionsView;
        if (cv) views.add(cv);
      }
    }
    return views;
  }

  /**
   * Reorders Word collections in a single collectionsView instance.
   * @private
   */
  _reorderViewCollections(cv) {
    const rows = cv?._rows;
    if (!cv || !Array.isArray(rows) || !rows.length) return false;

    const focusedID = cv.getRow?.(cv.selection?.focused)?.id;
    const pivotID = cv.getRow?.(cv.selection?.pivot)?.id;
    const selectedIDs = cv.selection?.selected instanceof Set
      ? [...cv.selection.selected].map(idx => cv.getRow?.(idx)?.id).filter(Boolean) : [];

    let anyChanged = false, i = 0;
    while (i < rows.length) {
      const row = rows[i];
      const isLib = Boolean(row?.isLibrary?.(true) || row?.type === "library" || row?.type === "group");
      if (isLib && (typeof cv.isContainerOpen !== "function" || cv.isContainerOpen(i))) {
        const libLevel = typeof cv.getLevel === "function" ? cv.getLevel(i) : (row.level ?? 0);
        let endIndex = i + 1;
        while (endIndex < rows.length) {
          const nextLevel = typeof cv.getLevel === "function" ? cv.getLevel(endIndex) : (rows[endIndex]?.level ?? 0);
          if (nextLevel <= libLevel) break;
          endIndex += 1;
        }
        if (this._reorderCitationRowsInSlice(rows, i + 1, endIndex, libLevel + 1)) anyChanged = true;
        i = endIndex;
      } else {
        i += 1;
      }
    }

    if (!anyChanged) return false;
    cv._refreshRowMap?.();
    if (cv.selection && cv._rowMap) {
      if (focusedID && typeof cv._rowMap[focusedID] === "number") cv.selection.focused = cv._rowMap[focusedID];
      if (pivotID && typeof cv._rowMap[pivotID] === "number") cv.selection.pivot = cv._rowMap[pivotID];
      if (cv.selection.selected instanceof Set && selectedIDs.length) {
        cv.selection.selected = new Set(selectedIDs.map(id => cv._rowMap[id]).filter(idx => typeof idx === "number"));
      }
    }
    cv.tree?.invalidate?.();
    return true;
  }

  /**
   * Repositions active CiteFlow Word collection rows across all open views to sit right above My Publications.
   */
  repositionCitationCollections() {
    if (this._disposed || addon?.data?.alive === false) return false;
    let anyChanged = false;
    for (const cv of this._getAllCollectionsViews()) {
      if (this._reorderViewCollections(cv)) anyChanged = true;
    }
    return anyChanged;
  }

  /**
   * Inserts a CiteFlow temporary Word collection row immediately above My Publications in collectionsView.
   * @private
   */
  _insertCitationRowAbovePublications(cv, col) {
    const startRow = cv._rowMap?.["L" + col.libraryID];
    if (startRow === undefined || (typeof cv.isContainerOpen === "function" && !cv.isContainerOpen(startRow))) return false;
    const libLevel = typeof cv.getLevel === "function" ? cv.getLevel(startRow) : (cv._rows?.[startRow]?.level ?? 0);
    const level = libLevel + 1;
    let beforeRow = startRow + 1;
    if (typeof cv.isContainerEmpty !== "function" || !cv.isContainerEmpty(startRow)) {
      for (let i = startRow + 1; i < (cv._rows?.length || 0); i++) {
        const rowLevel = typeof cv.getLevel === "function" ? cv.getLevel(i) : (cv._rows[i]?.level ?? 0);
        if (rowLevel < level) { beforeRow = i; break; }
        if (rowLevel === level) {
          const treeRow = cv.getRow(i);
          if (this._isBottomVirtualRow(treeRow)) { beforeRow = i; break; }
          if ((treeRow?.isCollection?.() || treeRow?.type === "collection")
            && this._isCitationCollection(treeRow.ref)
            && this._compareCollectionNames(treeRow.ref?.name, col.name) > 0) {
            beforeRow = i;
            break;
          }
        }
        beforeRow = i + 1;
      }
    }
    if (typeof cv._includedInTree !== "function" || cv._includedInTree(col)) {
      cv._addRow(new Zotero.CollectionTreeRow(cv, "collection", col, level), beforeRow);
    }
    return beforeRow;
  }

  /**
   * Patches collectionsView.renderItem, _expandRow, and _addSortedRow to display the Word icon
   * and position CiteFlow temporary collections immediately above My Publications.
   */
  async patchIcon() {
    try {
      const view = this;
      const cv = this.pane?.collectionsView;
      if (!cv) return;
      const restoreRender = runtime.patch(cv, "renderItem", config.addonRef, (original) => (index, selection, oldDiv, columns) => {
        const previousIcon = oldDiv?.querySelector?.(".cell-icon");
        if (previousIcon) {
          view._restoreIconNode(previousIcon);
          view._iconNodeStates?.delete(previousIcon);
        }
        const div = original.call(cv, index, selection, oldDiv, columns);
        if (view._disposed || addon.data.alive === false) return div;
        const row = cv.getRow(index);
        const isCitationCollection = view._isCitationCollection(row?.ref);
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
      });
      if (typeof restoreRender === "function") (this._patchDisposers ??= []).push(restoreRender);

      if (typeof cv._expandRow === "function") {
        const restoreExpand = runtime.patch(cv, "_expandRow", config.addonRef, (original) => async function(rows, row, forceOpen) {
          const added = await original.call(this, rows, row, forceOpen);
          if (!view._disposed && addon.data.alive !== false && added > 0 && rows?.[row]?.isLibrary?.(true)) {
            const libLevel = typeof this.getLevel === "function" && rows === this._rows ? this.getLevel(row) : (rows[row]?.level ?? 0);
            if (view._reorderCitationRowsInSlice(rows, row + 1, row + 1 + added, libLevel + 1)) {
              this._refreshRowMap?.();
              this.tree?.invalidate?.();
            }
          }
          return added;
        });
        if (typeof restoreExpand === "function") (this._patchDisposers ??= []).push(restoreExpand);
      }

      if (typeof cv._addSortedRow === "function") {
        const restoreAddSorted = runtime.patch(cv, "_addSortedRow", config.addonRef, (original) => async function(objectType, id) {
          if (view._disposed || addon.data.alive === false) return original.call(this, objectType, id);
          if (objectType === "collection") {
            const col = Zotero.Collections?.get?.(id) || await Zotero.Collections?.getAsync?.(id);
            if (col && !col.parentID && view._isCitationCollection(col)) {
              return view._insertCitationRowAbovePublications(this, col);
            }
          }
          const maskedRows = [];
          for (const row of this._rows || []) {
            if ((row?.isCollection?.() || row?.type === "collection") && view._isCitationCollection(row?.ref)) {
              row.isCollection = () => false;
              maskedRows.push(row);
            }
          }
          try {
            return await original.call(this, objectType, id);
          } finally {
            for (const row of maskedRows) delete row.isCollection;
          }
        });
        if (typeof restoreAddSorted === "function") (this._patchDisposers ??= []).push(restoreAddSorted);
      }

      this.repositionCitationCollections();
    } catch (error) {
      runtime.log("[Views] Failed to patch citation collection icon:", error);
    }
  }

  /**
   * Caches original visual properties of an icon DOM node before patching.
   * @private
   */
  _rememberIconNode(iconNode) {
    this._iconNodeStates ??= new Map();
    if (this._iconNodeStates.size >= 64) {
      for (const node of this._iconNodeStates.keys()) {
        if (node.isConnected === false) this._iconNodeStates.delete(node);
      }
    }
    if (this._iconNodeStates.has(iconNode)) return;
    this._iconNodeStates.set(iconNode, {
      backgroundImage: iconNode.style?.backgroundImage || "",
      hadSearch: iconNode.classList?.contains("icon-search") === true,
      hadCollection: iconNode.classList?.contains("icon-collection") === true,
      hadPublications: iconNode.classList?.contains("icon-publications") === true
    });
  }

  /**
   * Restores an icon node to its pre-patch visual state.
   * @private
   */
  _restoreIconNode(iconNode, state = this._iconNodeStates?.get(iconNode)) {
    if (!iconNode || !state) return;
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
