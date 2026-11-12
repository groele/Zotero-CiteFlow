// ============================================================================
// Session Foreground Sync & Adaptive Polling Helpers
// ============================================================================

export const WINDOW_PROBE_COOLDOWN_MS = 3000;
export const LISTENER_IDLE_BACKOFF_TICKS = 5;
export const LISTENER_MAX_IDLE_INTERVAL_MS = 3000;
const timers = globalThis as unknown as { clearTimeout(id: number): void };

export interface SessionSyncSession {
  closing?: boolean;
  pending?: boolean;
  docId?: string;
  collection?: { name?: string };
  idData?: Record<string, unknown>;
}

export interface SessionSyncContext {
  _listenerStopped?: boolean;
  _listenerTimer?: number | null;
  _listenerBaseInterval?: number;
  _isListenerBackedOff?: boolean;
  _activityEpoch?: number;
  _idleTickCount?: number;
  _execCommandDepth?: number;
  _lastBgWindowProbeAt?: number;
  _allowBgWindowProbe?: boolean;
  _lastRefreshAt?: Record<string, number>;
  _scheduleListenerTick?: ((delay: number) => void) | null;
  activeSessionID?: string | null;
  sessions?: Record<string, SessionSyncSession>;
  _docIdBySession?: Record<string, string>;
  debugLog?(...args: unknown[]): void;
  _parseWordWindowTitle?(title: string): string;
  _getDocumentDisplayName(id: unknown): string;
  _getUniqueCollectionDisplayName?(id: string, doc: unknown): string;
  _isPendingCollectionName(name: string, id: string): boolean;
  _setActiveSessionID(id: string | null): void;
  _rememberSessionDocument?(id: string, doc: string): void;
  _clearCollectionRenameRetry?(id: string): void;
  _resolveFallbackDocumentId?(id: string, s: unknown, doc: unknown, foreground: boolean): string;
  _renameCollection?(id: string, name: string, doc?: string): Promise<void>;
  _scheduleCollectionRenameRetry?(id: string, name: string, doc?: string): void;
  logError?(message: string, error?: unknown): void;
  scheduleItemsViewRefresh?(target?: number[] | "full"): void;
  _noteListenerActivity?(): void;
}

/**
 * Computes the next listener polling delay using smooth idle backoff
 * without disturbing sub-500ms or oversized synthetic test intervals.
 */
export function computeNextListenerDelay(baseInterval: number, idleStreak: number): number {
  if (!Number.isFinite(baseInterval) || baseInterval <= 0) return 1000;
  if (baseInterval < 500 || baseInterval >= LISTENER_MAX_IDLE_INTERVAL_MS) return baseInterval;
  return idleStreak >= LISTENER_IDLE_BACKOFF_TICKS ? LISTENER_MAX_IDLE_INTERVAL_MS : baseInterval;
}

/**
 * Collects item IDs whose citation display can differ across an active-session switch.
 */
export function collectSessionSwitchRefreshIDs(
  ctx: SessionSyncContext,
  previousID: string | null | undefined,
  nextID: string
): number[] | "full" {
  if (!previousID || !nextID) return "full";
  const prevSession = ctx.sessions?.[previousID];
  const nextSession = ctx.sessions?.[nextID];
  if (!prevSession || !nextSession) return "full";
  const ids = new Set<number>();
  for (const data of [prevSession.idData, nextSession.idData]) {
    if (!data) continue;
    for (const key of Object.keys(data)) {
      const id = Number(key);
      if (Number.isSafeInteger(id) && id > 0) ids.add(id);
    }
  }
  return Array.from(ids);
}

/**
 * Syncs activeSessionID in the background only when the foreground Word window
 * uniquely identifies a single active tracked session.
 */
export function syncForegroundActiveSession(ctx: SessionSyncContext): boolean {
  if (ctx._listenerStopped) return false;
  const addonData = (globalThis as unknown as {
    addon?: { data?: { probeForegroundWordTitle?: () => string } };
  }).addon?.data;
  if (typeof addonData?.probeForegroundWordTitle !== "function") return false;

  const activeEntries = Object.entries(ctx.sessions || {}).filter(([, session]) => session && !session.closing);
  if (activeEntries.length === 0) return false;
  if (activeEntries.length === 1 && activeEntries[0][0] === ctx.activeSessionID) return false;

  const rawTitle = addonData.probeForegroundWordTitle();
  if (!rawTitle) return false;
  const fgName = ctx._parseWordWindowTitle?.(rawTitle) || "";
  if (!fgName) return false;

  const matches = activeEntries.filter(([sid, session]) => {
    const docId = ctx._docIdBySession?.[sid] || session.docId || "";
    return docId ? ctx._getDocumentDisplayName(docId) === fgName : false;
  });
  if (matches.length !== 1) return false;

  const [matchedID] = matches[0];
  if (matchedID === ctx.activeSessionID) return false;

  const previousID = ctx.activeSessionID;
  const refreshTarget = collectSessionSwitchRefreshIDs(ctx, previousID, matchedID);
  ctx._setActiveSessionID(matchedID);
  ctx.debugLog?.("Foreground Word window synced active session", { previousID, matchedID, fgName });
  ctx.scheduleItemsViewRefresh?.(refreshTarget);
  ctx._noteListenerActivity?.();
  return true;
}

/**
 * Checks whether any active session still carries a pending state or pending collection name.
 */
export function hasPendingTrackedSession(ctx: SessionSyncContext): boolean {
  for (const [sid, session] of Object.entries(ctx.sessions || {})) {
    if (!session || session.closing) continue;
    if (session.pending) return true;
    const colName = session.collection?.name;
    if (colName && ctx._isPendingCollectionName(colName, sid)) return true;
  }
  return false;
}

/**
 * Records observed listener/command activity to keep polling responsive.
 */
export function recordListenerActivity(ctx: SessionSyncContext): void {
  ctx._activityEpoch = (ctx._activityEpoch || 0) + 1;
  ctx._idleTickCount = 0;
}

/**
 * If listener polling was backed off while waiting, resets the timer back to the active cadence.
 */
export function rescheduleListenerIfBackedOff(
  ctx: SessionSyncContext,
  scheduleNextTick: (delay: number) => void
): void {
  if (ctx._listenerStopped || !ctx._isListenerBackedOff || !ctx._listenerTimer) return;
  const baseInterval = typeof ctx._listenerBaseInterval === "number" && ctx._listenerBaseInterval > 0
    ? ctx._listenerBaseInterval : 1000;
  timers.clearTimeout(ctx._listenerTimer);
  ctx._listenerTimer = null;
  ctx._isListenerBackedOff = false;
  scheduleNextTick(baseInterval);
}

/**
 * Prepares per-tick background window probe gating under the 3-second cooldown.
 */
export function prepareTickProbeWindow(ctx: SessionSyncContext): number {
  const now = Date.now();
  ctx._allowBgWindowProbe = !ctx._lastBgWindowProbeAt || now - ctx._lastBgWindowProbeAt >= WINDOW_PROBE_COOLDOWN_MS;
  return ctx._activityEpoch || 0;
}

/**
 * Schedules the next listener poll using smooth idle backoff when inactive.
 */
export function finishListenerTick(ctx: SessionSyncContext, baseInterval: number, epochBefore: number): void {
  delete ctx._allowBgWindowProbe;
  if (ctx._listenerStopped) return;
  const hadActivity = (ctx._activityEpoch || 0) !== epochBefore
    || (ctx._execCommandDepth || 0) > 0
    || hasPendingTrackedSession(ctx);
  ctx._idleTickCount = hadActivity ? 0 : (ctx._idleTickCount || 0) + 1;
  const activeCount = Object.keys(ctx.sessions || {}).length;
  const nextDelay = activeCount
    ? computeNextListenerDelay(baseInterval, ctx._idleTickCount)
    : Math.max(baseInterval, 5000);
  ctx._isListenerBackedOff = activeCount > 0 && nextDelay > baseInterval;
  ctx._scheduleListenerTick?.(nextDelay);
}

/**
 * Compensates overlapping/ambiguous execCommand completion once depth returns to zero.
 */
export function finalizeExecCommandCycle(ctx: SessionSyncContext, wasAmbiguous: boolean): void {
  if (ctx._listenerStopped || (ctx._execCommandDepth || 0) > 0) return;
  ctx._lastBgWindowProbeAt = 0;
  recordListenerActivity(ctx);
  if (wasAmbiguous) {
    ctx._lastRefreshAt = {};
    syncForegroundActiveSession(ctx);
  }
  if (ctx._scheduleListenerTick) {
    rescheduleListenerIfBackedOff(ctx, ctx._scheduleListenerTick);
  }
}

/**
 * Resolves and records the active document identifier for a completed command session.
 */
export function resolveAndApplyCommandDocument(
  ctx: SessionSyncContext,
  sessionID: string,
  nativeSession: unknown,
  bindingDoc: unknown,
  docId: unknown,
  addonData?: { docId?: string }
): string {
  const hasExplicitDocId = typeof docId === "string" && docId.trim() !== "";
  const effectiveDocId = hasExplicitDocId
    ? docId
    : (ctx._resolveFallbackDocumentId?.(sessionID, nativeSession, bindingDoc, true) || "");
  const targetName = effectiveDocId
    ? (ctx._getUniqueCollectionDisplayName?.(sessionID, effectiveDocId) || ctx._getDocumentDisplayName(effectiveDocId))
    : "";
  if (targetName) {
    ctx._rememberSessionDocument?.(sessionID, effectiveDocId);
  } else if (hasExplicitDocId) {
    ctx._clearCollectionRenameRetry?.(sessionID);
    if (ctx._docIdBySession) delete ctx._docIdBySession[sessionID];
    if (ctx.sessions?.[sessionID]) delete ctx.sessions[sessionID].docId;
    if (addonData) delete addonData.docId;
  }
  ctx._setActiveSessionID(sessionID);
  if (targetName && addonData) addonData.docId = effectiveDocId;
  return effectiveDocId;
}

/**
 * Computes the unique display name and renames a tracked session's temporary collection if needed.
 */
export async function applySessionCollectionRename(
  ctx: SessionSyncContext,
  sessionID: string,
  trackedSession: SessionSyncSession,
  effectiveDocId: string | undefined
): Promise<string> {
  const targetName = effectiveDocId
    ? (ctx._getUniqueCollectionDisplayName?.(sessionID, effectiveDocId) || ctx._getDocumentDisplayName(effectiveDocId))
    : "";
  if (trackedSession.collection && targetName && trackedSession.collection.name !== targetName) {
    try {
      await ctx._renameCollection?.(sessionID, targetName, effectiveDocId);
      recordListenerActivity(ctx);
    } catch (error) {
      ctx.logError?.(`Failed to rename Word citation collection for ${sessionID}`, error);
      ctx._scheduleCollectionRenameRetry?.(sessionID, targetName, effectiveDocId);
    }
  }
  return targetName;
}
