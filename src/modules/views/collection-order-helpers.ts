// ============================================================================
// Collection Tree Reordering & Positioning Helpers
// ============================================================================

import type { CitationSessionApi } from "../citation/session-contract.ts";

export interface CollectionRef {
  key?: string;
  libraryID?: number;
  name?: string;
  parentID?: number | null;
  _isCiteFlowCollection?: boolean;
  getRelationsByPredicate?(key: string): string[];
}

export interface TreeRow {
  type?: string;
  level?: number;
  id?: string;
  ref?: CollectionRef;
  isCollection?(): boolean;
  isLibrary?(groups: boolean): boolean;
  isPublications?(): boolean;
  isDuplicates?(): boolean;
  isUnfiled?(): boolean;
  isRetracted?(): boolean;
  isTrash?(): boolean;
}

export interface CollectionView {
  _rows: TreeRow[];
  _rowMap?: Record<string, number>;
  selection?: { focused: number; pivot: number; selected: Set<number> };
  tree?: { invalidate?(): void };
  getRow(index: number | undefined): TreeRow;
  isContainerOpen?(index: number): boolean;
  isContainerEmpty?(index: number): boolean;
  getLevel?(index: number): number;
  _refreshRowMap?(): void;
  _includedInTree?(collection: CollectionRef): boolean;
  _addRow(row: TreeRow, index: number): void;
  _expandRow?: unknown;
  _addSortedRow?: unknown;
  [key: string]: unknown;
}

export interface IconState {
  backgroundImage: string;
  hadSearch: boolean;
  hadCollection: boolean;
  hadPublications: boolean;
}

export interface IconContext {
  pane?: { collectionsView?: CollectionView };
  _disposed: boolean;
  _patchDisposers: Array<() => void>;
  _iconNodeStates: Map<HTMLElement, IconState>;
  _nonCitationCollectionCache?: WeakSet<object>;
  _getSessionIndex?(api: CitationSessionApi): { byKey: Map<string, Array<{ collection?: { libraryID?: number } }>> };
  _isCitationCollection(ref?: CollectionRef): boolean;
  _isBottomVirtualRow(row?: TreeRow): boolean;
  _compareCollectionNames(a?: string, b?: string): number;
  _reorderCitationRowsInSlice(rows: TreeRow[], start: number, end: number, level: number): boolean;
  _getAllCollectionsViews(): Set<CollectionView>;
  _reorderViewCollections(view: CollectionView): boolean;
  _insertCitationRowAbovePublications(view: CollectionView, collection: CollectionRef): number | false;
  repositionCitationCollections(): boolean;
  _rememberIconNode(node: HTMLElement): void;
  _restoreIconNode(node: HTMLElement, state?: IconState): void;
}

type Host = {
  ZoteroCitation?: { api?: CitationSessionApi };
  CollectionTreeRow: new (view: CollectionView, type: string, collection: CollectionRef, level: number) => TreeRow;
};

/** Checks whether a CollectionTreeRow is a bottom virtual library row (starting at My Publications). */
export function isBottomVirtualRow(treeRow?: TreeRow): boolean {
  if (!treeRow || typeof treeRow !== "object") return false;
  const t = treeRow.type;
  return t === "publications" || t === "duplicates" || t === "unfiled" || t === "retracted" || t === "trash"
    || Boolean(treeRow.isPublications?.() || treeRow.isDuplicates?.() || treeRow.isUnfiled?.() || treeRow.isRetracted?.() || treeRow.isTrash?.());
}

/** Compares two collection names using Zotero's locale collator. */
export function compareCollectionNames(nameA?: string, nameB?: string): number {
  const a = String(nameA ?? ""), b = String(nameB ?? "");
  return typeof Zotero?.localeCompare === "function" ? Zotero.localeCompare(a, b) : a.localeCompare(b);
}

/** Reorders CiteFlow temporary Word collection rows within a library slice above My Publications. */
export function reorderCitationRowsInSlice(
  ctx: IconContext,
  rows: TreeRow[],
  startIndex: number,
  endIndex: number,
  targetLevel: number
): boolean {
  if (!Array.isArray(rows) || startIndex < 0 || endIndex <= startIndex || endIndex > rows.length) return false;
  const beforeBlocks: TreeRow[][] = [], citationBlocks: TreeRow[][] = [], afterBlocks: TreeRow[][] = [];
  let i = startIndex, reachedBottomVirtual = false;

  while (i < endIndex) {
    const head = rows[i], block = [head];
    i += 1;
    while (i < endIndex && (rows[i]?.level ?? targetLevel) > targetLevel) {
      block.push(rows[i]);
      i += 1;
    }
    const isCitation = Boolean((head?.isCollection?.() || head?.type === "collection") && ctx._isCitationCollection(head?.ref));
    if (isCitation) citationBlocks.push(block);
    else if (reachedBottomVirtual || ctx._isBottomVirtualRow(head)) {
      reachedBottomVirtual = true;
      afterBlocks.push(block);
    } else beforeBlocks.push(block);
  }

  if (!citationBlocks.length) return false;
  citationBlocks.sort((a, b) => ctx._compareCollectionNames(a[0]?.ref?.name, b[0]?.ref?.name));
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

/** Reorders Word collections in a single collectionsView instance while preserving selection focus. */
export function reorderViewCollections(ctx: IconContext, cv: CollectionView): boolean {
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
      if (ctx._reorderCitationRowsInSlice(rows, i + 1, endIndex, libLevel + 1)) anyChanged = true;
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
      cv.selection.selected = new Set(selectedIDs.map(id => cv._rowMap![id!]).filter(idx => typeof idx === "number"));
    }
  }
  cv.tree?.invalidate?.();
  return true;
}

/** Inserts a CiteFlow temporary Word collection row immediately above My Publications. */
export function insertCitationRowAbovePublications(
  ctx: IconContext,
  cv: CollectionView,
  col: CollectionRef
): number | false {
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
        if (ctx._isBottomVirtualRow(treeRow)) { beforeRow = i; break; }
        if ((treeRow?.isCollection?.() || treeRow?.type === "collection")
          && ctx._isCitationCollection(treeRow.ref)
          && ctx._compareCollectionNames(treeRow.ref?.name, col.name) > 0) {
          beforeRow = i;
          break;
        }
      }
      beforeRow = i + 1;
    }
  }
  if (typeof cv._includedInTree !== "function" || cv._includedInTree(col)) {
    cv._addRow(new (Zotero as unknown as Host).CollectionTreeRow(cv, "collection", col, level), beforeRow);
  }
  return beforeRow;
}
