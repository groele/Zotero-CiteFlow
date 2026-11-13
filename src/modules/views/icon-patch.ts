import { config } from "../../config.ts";
import type { CitationSessionApi } from "../citation/session-contract.ts";
import {
  compareCollectionNames,
  insertCitationRowAbovePublications,
  isBottomVirtualRow,
  reorderCitationRowsInSlice,
  reorderViewCollections,
  type CollectionRef,
  type CollectionView,
  type IconContext,
  type TreeRow
} from "./collection-order-helpers.ts";

type HostMethod = (this: unknown, ...args: unknown[]) => unknown;
declare const addon: { data: { alive: boolean; citation?: { _temporaryCollectionKeys?: Set<string> } } };
declare const runtime: { patch(owner: CollectionView, key: string, name: string, create: (original: HostMethod) => HostMethod): () => void; log(...args: unknown[]): void };
type Host = { ZoteroCitation?: { api?: CitationSessionApi } };
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
  _isCitationCollection(this: IconContext, rowRef?: CollectionRef): boolean {
    if (!rowRef || typeof rowRef !== "object") return false;
    if (rowRef._isCiteFlowCollection === true) return true;
    const key = rowRef.key;
    if (typeof key === "string" && key) {
      if (addon?.data?.citation?._temporaryCollectionKeys?.has?.(key)) return true;
      const candidates = this._getSessionIndex?.((Zotero as unknown as Host).ZoteroCitation?.api || {})?.byKey?.get?.(key) || [];
      if (candidates.some(s => s?.collection?.libraryID == null || rowRef.libraryID == null || s.collection.libraryID === rowRef.libraryID)) {
        return true;
      }
    }
    if (this._nonCitationCollectionCache?.has(rowRef)) return false;
    try {
      const relations = rowRef.getRelationsByPredicate?.(TEMP_COLLECTION_RELATION) || [];
      if (Array.isArray(relations) && relations.some(rel => TEMP_COLLECTION_MARKERS.has(rel))) return true;
      if (typeof rowRef.getRelationsByPredicate === "function") {
        (this._nonCitationCollectionCache ??= new WeakSet()).add(rowRef);
      }
    } catch {}
    return false;
  }

  /** @private */
  _isBottomVirtualRow(treeRow?: TreeRow): boolean {
    return isBottomVirtualRow(treeRow);
  }

  /** @private */
  _compareCollectionNames(nameA?: string, nameB?: string): number {
    return compareCollectionNames(nameA, nameB);
  }

  /** @private */
  _reorderCitationRowsInSlice(this: IconContext, rows: TreeRow[], startIndex: number, endIndex: number, targetLevel: number): boolean {
    return reorderCitationRowsInSlice(this, rows, startIndex, endIndex, targetLevel);
  }

  /**
   * Enumerates all unique active collectionsView instances across main and detached windows.
   * @private
   */
  _getAllCollectionsViews(this: IconContext): Set<CollectionView> {
    const views = new Set<CollectionView>();
    if (this.pane?.collectionsView) views.add(this.pane.collectionsView);
    if (typeof Zotero?.getMainWindows === "function") {
      for (const win of Zotero.getMainWindows()) {
        const cv = win?.ZoteroPane?.collectionsView as unknown as CollectionView | undefined;
        if (cv) views.add(cv);
      }
    }
    return views;
  }

  /** @private */
  _reorderViewCollections(this: IconContext, cv: CollectionView): boolean {
    return reorderViewCollections(this, cv);
  }

  /**
   * Repositions active CiteFlow Word collection rows across all open views to sit right above My Publications.
   */
  repositionCitationCollections(this: IconContext): boolean {
    if (this._disposed || addon?.data?.alive === false) return false;
    let anyChanged = false;
    for (const cv of this._getAllCollectionsViews()) {
      if (this._reorderViewCollections(cv)) anyChanged = true;
    }
    return anyChanged;
  }

  /** @private */
  _insertCitationRowAbovePublications(this: IconContext, cv: CollectionView, col: CollectionRef): number | false {
    return insertCitationRowAbovePublications(this, cv, col);
  }

  /**
   * Patches collectionsView.renderItem, _expandRow, and _addSortedRow to display the Word icon
   * and position CiteFlow temporary collections immediately above My Publications.
   */
  async patchIcon(this: IconContext): Promise<void> {
    try {
      const view = this;
      const cv = this.pane?.collectionsView;
      if (!cv) return;
      const restoreRender = runtime.patch(cv, "renderItem", config.addonRef, (original) => (...args: unknown[]) => {
        const [index, selection, oldDiv, columns] = args as [number, unknown, HTMLElement | null, unknown];
        if (view._iconNodeStates?.size) {
          const previousIcon = oldDiv?.querySelector<HTMLElement>(".cell-icon");
          if (previousIcon && view._iconNodeStates.has(previousIcon)) {
            view._restoreIconNode(previousIcon);
            view._iconNodeStates.delete(previousIcon);
          }
        }
        const div = original.call(cv, index, selection, oldDiv, columns) as HTMLElement | null;
        if (view._disposed || addon.data.alive === false) return div;
        const row = cv.getRow(index);
        const isCitationCollection = Boolean(row?.isCollection?.() || row?.type === "collection")
          && view._isCitationCollection(row?.ref);
        if (isCitationCollection) {
          const iconNode = div?.querySelector<HTMLElement>(".cell-icon");
          if (iconNode) {
            view._rememberIconNode(iconNode);
            iconNode.style.backgroundImage = `url(chrome://${config.addonRef}/content/icons/word.svg)`;
            iconNode.classList.remove("icon-search", "icon-collection");
            iconNode.classList.add("icon-publications");
          }
        } else if (view._iconNodeStates?.size) {
          const iconNode = div?.querySelector<HTMLElement>(".cell-icon");
          if (iconNode && view._iconNodeStates.has(iconNode)) { view._restoreIconNode(iconNode); view._iconNodeStates.delete(iconNode); }
        }
        return div;
      });
      if (typeof restoreRender === "function") (this._patchDisposers ??= []).push(restoreRender);

      if (typeof cv._expandRow === "function") {
        const restoreExpand = runtime.patch(cv, "_expandRow", config.addonRef, (original) => async function(this: unknown, ...args: unknown[]) {
          const [rows, row, forceOpen] = args as [TreeRow[], number, boolean];
          const current = this as CollectionView;
          const added = await original.call(this, rows, row, forceOpen) as number;
          if (!view._disposed && addon.data.alive !== false && added > 0 && rows?.[row]?.isLibrary?.(true)) {
            const libLevel = typeof current.getLevel === "function" && rows === current._rows ? current.getLevel(row) : (rows[row]?.level ?? 0);
            if (view._reorderCitationRowsInSlice(rows, row + 1, row + 1 + added, libLevel + 1)) {
              current._refreshRowMap?.();
              current.tree?.invalidate?.();
            }
          }
          return added;
        });
        if (typeof restoreExpand === "function") (this._patchDisposers ??= []).push(restoreExpand);
      }

      if (typeof cv._addSortedRow === "function") {
        const restoreAddSorted = runtime.patch(cv, "_addSortedRow", config.addonRef, (original) => async function(this: unknown, ...args: unknown[]) {
          const [objectType, id] = args as [string, number];
          const current = this as CollectionView;
          if (view._disposed || addon.data.alive === false) return original.call(this, objectType, id);
          if (objectType === "collection") {
            const col = Zotero.Collections?.get?.(id) || await Zotero.Collections?.getAsync?.(id);
            if (col && !col.parentID && view._isCitationCollection(col)) {
              return view._insertCitationRowAbovePublications(current, col as unknown as CollectionRef);
            }
          }
          const maskedRows: Array<{ row: TreeRow; hasOwn: boolean; original: TreeRow["isCollection"] }> = [];
          for (const row of current._rows || []) {
            if ((row?.isCollection?.() || row?.type === "collection") && view._isCitationCollection(row?.ref)) {
              const hasOwn = Object.prototype.hasOwnProperty.call(row, "isCollection");
              const originalFn = row.isCollection;
              row.isCollection = () => false;
              maskedRows.push({ row, hasOwn, original: originalFn });
            }
          }
          try {
            return await original.call(this, objectType, id);
          } finally {
            for (const { row, hasOwn, original: originalFn } of maskedRows) {
              if (hasOwn) row.isCollection = originalFn;
              else delete row.isCollection;
            }
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
  _rememberIconNode(this: IconContext, iconNode: HTMLElement): void {
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
  _restoreIconNode(this: IconContext, iconNode: HTMLElement, state = this._iconNodeStates?.get(iconNode)): void {
    if (!iconNode || !state) return;
    const bg = String(iconNode.style?.backgroundImage || "");
    if (bg.includes("/content/icons/word.svg") || bg.includes("/content/icons/word.png")) {
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
