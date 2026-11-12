// ============================================================================
// Snapshot Dirty-Checking & Targeted ItemTree Invalidation Helpers
// ============================================================================

import { config } from "../../config.ts";
import type { CitationMap, FormatContext, IdData, NativeSession } from "./formatting-contract.ts";
import { tryCommitSessionFingerprint } from "./sync-state-helpers.ts";

const MAX_TARGETED_ROW_INVALIDATIONS = 200;

export interface FingerprintSession {
  collection?: { key?: string; libraryID?: number };
  idData?: IdData;
}

export interface TargetableItemsView {
  refreshAndMaintainSelection(): Promise<void>;
  invalidateRowCache?(ids: number[] | boolean): void;
  getRowIndexByID?(id: number): number | false;
  getSortFields?(): unknown[];
  getSortField?(): unknown;
  _rowMap?: Record<number, number>;
  tree?: { invalidateRow?(rowIndex: number): void };
}

/**
 * Builds an input fingerprint across style, ordered citations, collection state,
 * and referenced item metadata so unchanged idle polls can skip work cleanly.
 */
export function buildRefreshInputFingerprint(
  styleClass: string | undefined,
  sortedItemIDs: number[],
  citationsByItemID: CitationMap | undefined,
  session: FingerprintSession | undefined,
  collectionsEnabled: boolean
): string {
  const col = session?.collection;
  const colPart = !collectionsEnabled
    ? "col:off"
    : (col ? `col:${col.key || ""}:${col.libraryID ?? ""}` : "col:none");
  const hasSessionData = session?.idData && Object.keys(session.idData).length > 0 ? 1 : 0;
  const parts: string[] = [
    `style:${typeof styleClass === "string" ? styleClass : ""}`,
    colPart,
    `count:${sortedItemIDs.length}`,
    `hasData:${hasSessionData}`
  ];

  const orderedSet = new Set(sortedItemIDs);
  const extraIDs: number[] = [];
  if (citationsByItemID && typeof citationsByItemID === "object") {
    for (const rawKey of Object.keys(citationsByItemID)) {
      const parsed = Number(rawKey);
      if (Number.isSafeInteger(parsed) && parsed > 0 && !orderedSet.has(parsed)) {
        extraIDs.push(parsed);
      }
    }
    extraIDs.sort((a, b) => a - b);
  }

  const itemsApi = typeof Zotero !== "undefined" ? Zotero?.Items : undefined;
  const appendEntry = (id: number, prefix: string): void => {
    const rawList = citationsByItemID?.[id];
    const citations = Array.isArray(rawList)
      ? rawList.map(entry => {
          const text = (entry as { properties?: { plainCitation?: unknown } })?.properties?.plainCitation;
          return typeof text === "string" ? text : "";
        }).join("\u001e")
      : "";
    const item = typeof itemsApi?.get === "function"
      ? (itemsApi.get(id) as { libraryID?: number; deleted?: boolean; inTrash?: boolean } | null | undefined)
      : null;
    const meta = item
      ? `${item.libraryID ?? ""}:${item.deleted === true ? 1 : 0}:${item.inTrash === true ? 1 : 0}`
      : "missing";
    parts.push(`${prefix}${id}\u001f${meta}\u001f${citations}`);
  };

  for (const id of sortedItemIDs) appendEntry(id, "");
  for (const id of extraIDs) appendEntry(id, "+");
  return parts.join("\u001d");
}

/**
 * Returns numeric item IDs whose formatted plainCitation string changed, or "full"
 * when a non-numeric key requires full tree fallback.
 */
export function collectChangedCitationItemIDs(oldData: IdData | undefined, newData: IdData | undefined): number[] | "full" {
  const prev = oldData || {};
  const next = newData || {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const changed: number[] = [];
  for (const key of keys) {
    if (prev[key]?.plainCitation === next[key]?.plainCitation) continue;
    const id = Number(key);
    if (!Number.isSafeInteger(id) || id <= 0) return "full";
    changed.push(id);
  }
  return changed;
}

/**
 * Determines whether the active ItemTree sort currently includes the Citation column.
 */
export function isCitationColumnSorted(itemsView: TargetableItemsView): boolean {
  let sortFields: unknown[] | null = null;
  try {
    if (typeof itemsView.getSortFields === "function") {
      const fields = itemsView.getSortFields();
      sortFields = Array.isArray(fields) ? fields : null;
    } else if (typeof itemsView.getSortField === "function") {
      sortFields = [itemsView.getSortField()];
    }
  } catch {
    return true;
  }
  if (!sortFields) return true;

  const views = (globalThis as unknown as {
    addon?: {
      data?: {
        views?: {
          getColumnInfo?(dataKey: string): { dataKey?: string } | null | undefined;
          _registeredColumnKeys?: Set<string>;
        };
      };
    };
  }).addon?.data?.views;

  const ownedKeys = new Set<string>([
    "citation",
    `${config.addonID}-citation`,
    "zoterocitation@polygon.org-citation"
  ]);
  const info = views?.getColumnInfo?.("citation");
  if (typeof info?.dataKey === "string" && info.dataKey) ownedKeys.add(info.dataKey);
  if (views?._registeredColumnKeys) {
    for (const key of views._registeredColumnKeys) ownedKeys.add(key);
  }

  return sortFields.some(field => {
    if (typeof field !== "string" || !field) return false;
    return ownedKeys.has(field) || field.endsWith("-citation");
  });
}

/**
 * Attempts row-level ItemTree cache invalidation and tree redraw for changed item IDs;
 * falls back automatically to refreshAndMaintainSelection() whenever unsafe or unsupported.
 */
export async function refreshItemsViewTargeted(
  itemsView: TargetableItemsView,
  target: Set<number> | "full" | null
): Promise<void> {
  if (!target || target === "full" || !(target instanceof Set) || target.size === 0 || target.size > MAX_TARGETED_ROW_INVALIDATIONS) {
    if (target instanceof Set && target.size === 0) return;
    await itemsView.refreshAndMaintainSelection();
    return;
  }

  if (
    typeof itemsView.invalidateRowCache !== "function"
    || typeof itemsView.getRowIndexByID !== "function"
    || typeof itemsView.tree?.invalidateRow !== "function"
    || isCitationColumnSorted(itemsView)
  ) {
    await itemsView.refreshAndMaintainSelection();
    return;
  }

  const changedIDs = Array.from(target);
  const visibleRowIndices: number[] = [];
  for (const id of changedIDs) {
    const rowIndex = itemsView.getRowIndexByID(id);
    if (typeof rowIndex === "number" && rowIndex >= 0) {
      visibleRowIndices.push(rowIndex);
    }
  }

  if (visibleRowIndices.length > MAX_TARGETED_ROW_INVALIDATIONS) {
    await itemsView.refreshAndMaintainSelection();
    return;
  }

  itemsView.invalidateRowCache(changedIDs);
  for (const rowIndex of visibleRowIndices) {
    itemsView.tree.invalidateRow(rowIndex);
  }
}

/**
 * Merges incoming changed item IDs into any pending debounced refresh target.
 */
export function mergePendingRefreshTarget(
  current: Set<number> | "full" | null | undefined,
  incoming?: number[] | "full"
): Set<number> | "full" | null {
  if (!Array.isArray(incoming)) return "full";
  if (current === "full") return "full";
  const next = current instanceof Set ? current : new Set<number>();
  for (const id of incoming) {
    if (Number.isSafeInteger(id) && id > 0) next.add(id);
  }
  return next.size > 0 ? next : (current instanceof Set ? current : null);
}

/**
 * Applies a pending ItemTree refresh across all unique Zotero main windows.
 */
export async function dispatchItemsViewRefresh(
  target: Set<number> | "full" | null,
  onError: (message: string, error: unknown) => void
): Promise<boolean> {
  const panes = Zotero.getMainWindows?.().map(win => win.ZoteroPane)
    || [(globalThis as unknown as { ZoteroPane?: { itemsView?: TargetableItemsView } }).ZoteroPane];
  const seenViews = new Set<unknown>();
  let allSucceeded = true;
  for (const pane of panes) {
    const itemsView = (pane as unknown as { itemsView?: TargetableItemsView } | undefined)?.itemsView;
    if (!itemsView || seenViews.has(itemsView)) continue;
    seenViews.add(itemsView);
    try {
      await refreshItemsViewTargeted(itemsView, target);
    } catch (error) {
      try {
        await itemsView.refreshAndMaintainSelection();
      } catch (fallbackError) {
        allSucceeded = false;
        onError("Cannot refresh the citation column", fallbackError || error);
      }
    }
  }
  return allSucceeded;
}

/**
 * Invalidates any cached snapshot fingerprint for a tracked session.
 */
export function invalidateRefreshFingerprint(ctx: Partial<FormatContext>, session: object | undefined): void {
  if (!session) return;
  ctx._lastRefreshFingerprintBySession?.delete(session);
  ctx._pendingRefreshFingerprintBySession?.delete(session);
  ctx._lastSyncFailedBySession?.delete(session);
}

/**
 * Skips redundant formatting/collection sync when snapshot inputs match the last
 * clean refresh, or executes and defers fingerprint commit until tag sync and list invalidation succeed.
 */
export async function updateSessionCitationsIfDirty(
  ctx: FormatContext,
  sessionID: string,
  targetSession: NativeSession,
  sortedItemIDs: number[],
  citationsByItemID: CitationMap
): Promise<void> {
  const session = ctx.sessions?.[sessionID];
  if (!session || ctx._listenerStopped) return;

  const payload = sortedItemIDs.length ? citationsByItemID : {};
  const collectionsEnabled = ctx._collectionsEnabled !== false;
  const fingerprint = buildRefreshInputFingerprint(
    targetSession.styleClass,
    sortedItemIDs,
    payload,
    session,
    collectionsEnabled
  );

  ctx._lastRefreshFingerprintBySession ??= new WeakMap();
  ctx._pendingRefreshFingerprintBySession ??= new WeakMap();
  ctx._lastSyncFailedBySession ??= new WeakMap();
  if (
    ctx._lastRefreshFingerprintBySession.get(session) === fingerprint
    && ctx._lastSyncFailedBySession.get(session) !== true
    && !ctx._tagSyncFailedBySession?.[sessionID]
    && !ctx._viewRefreshFailed
  ) {
    return;
  }

  const revBefore = ctx._sessionUpdateRevision?.[sessionID] || 0;
  ctx._lastSyncFailedBySession.set(session, false);
  ctx._pendingRefreshFingerprintBySession.delete(session);
  ctx.scheduleCitationTagSync(sessionID, sortedItemIDs);
  await ctx.updateCitations(sessionID, payload, sortedItemIDs, targetSession.styleClass);

  if (ctx._listenerStopped || session.closing || ctx.sessions?.[sessionID] !== session) return;
  const revAfter = ctx._sessionUpdateRevision?.[sessionID] || 0;
  if (ctx._lastSyncFailedBySession.get(session) === true) return;
  if (revAfter !== revBefore && (ctx._sessionUpdateRevision?.[sessionID] || 0) !== revAfter) return;
  const finalFingerprint = buildRefreshInputFingerprint(targetSession.styleClass, sortedItemIDs, payload, session, collectionsEnabled);
  ctx._pendingRefreshFingerprintBySession.set(session, {
    sessionID,
    fingerprint: finalFingerprint,
    revision: revAfter
  });
  tryCommitSessionFingerprint(ctx, sessionID);
}

/**
 * Syncs temporary collection items, commits formatted idData, records listener
 * activity, and triggers targeted ItemTree row invalidation.
 */
export async function commitAppliedSessionCitations(
  ctx: FormatContext,
  sessionID: string,
  citationSession: FormatContext["sessions"][string],
  targetIDs: number[],
  targetData: IdData,
  hasChanges: boolean,
  revision: number
): Promise<void> {
  if (ctx._sessionUpdateRevision[sessionID] !== revision) return;
  const syncResult = await ctx.syncCollectionItems(citationSession, targetIDs);
  ctx._lastSyncFailedBySession ??= new WeakMap();
  const syncFailed = syncResult === false;
  ctx._lastSyncFailedBySession.set(citationSession, syncFailed);
  if (syncFailed) {
    ctx._lastRefreshFingerprintBySession?.delete(citationSession);
    ctx._pendingRefreshFingerprintBySession?.delete(citationSession);
  }

  if (ctx._listenerStopped || citationSession.closing
    || ctx._sessionUpdateRevision[sessionID] !== revision || ctx.sessions?.[sessionID] !== citationSession) {
    return;
  }

  if (hasChanges || ctx._viewRefreshFailed) {
    const changedIDs = hasChanges
      ? collectChangedCitationItemIDs(citationSession.idData, targetData)
      : (ctx._failedItemsViewRefreshTarget instanceof Set ? [...ctx._failedItemsViewRefreshTarget] : "full");
    if (hasChanges) {
      citationSession.idData = targetData;
      ctx._invalidateSessionIndex();
      ctx._noteListenerActivity?.();
    }
    ctx.scheduleItemsViewRefresh(changedIDs);
  }
}
