// ============================================================================
// Deferred Fingerprint Commit & Sync Failure Invalidation Helpers
// ============================================================================

export interface PendingFingerprintCommit {
  sessionID: string;
  fingerprint: string;
  revision: number;
}

export interface SyncCompletionContext {
  _listenerStopped?: boolean;
  sessions?: Record<string, { closing?: boolean }>;
  _sessionUpdateRevision?: Record<string, number>;
  _lastRefreshFingerprintBySession?: WeakMap<object, string>;
  _pendingRefreshFingerprintBySession?: WeakMap<object, PendingFingerprintCommit>;
  _lastSyncFailedBySession?: WeakMap<object, boolean>;
  _tagSyncFailedBySession?: Record<string, boolean>;
  _tagSyncTimerBySession?: Record<string, number>;
  _pendingTagSyncIDsBySession?: Record<string, number[] | undefined>;
  _tagSyncInFlightBySession?: Record<string, Promise<unknown> | undefined>;
  _itemsViewRefreshTimer?: number | null;
  _pendingItemsViewRefreshIDs?: Set<number> | "full" | null;
  _itemsViewRefreshInFlight?: boolean;
  _viewRefreshFailed?: boolean;
  _failedItemsViewRefreshTarget?: Set<number> | "full" | null;
}

export function markSessionSyncFailed(ctx: SyncCompletionContext, session: object | undefined): void {
  if (!session) return;
  ctx._lastRefreshFingerprintBySession?.delete(session);
  ctx._pendingRefreshFingerprintBySession?.delete(session);
  ctx._lastSyncFailedBySession ??= new WeakMap();
  ctx._lastSyncFailedBySession.set(session, true);
}

export function hasPendingOrFailedTagSync(ctx: SyncCompletionContext, sessionID: string): boolean {
  return Boolean(
    ctx._tagSyncFailedBySession?.[sessionID]
    || ctx._tagSyncTimerBySession?.[sessionID]
    || ctx._pendingTagSyncIDsBySession?.[sessionID]
    || ctx._tagSyncInFlightBySession?.[sessionID]
  );
}

export function hasPendingOrFailedViewRefresh(ctx: SyncCompletionContext): boolean {
  return Boolean(
    ctx._viewRefreshFailed
    || ctx._itemsViewRefreshTimer
    || ctx._pendingItemsViewRefreshIDs
    || ctx._itemsViewRefreshInFlight
  );
}

export function tryCommitSessionFingerprint(ctx: SyncCompletionContext, sessionID: string): boolean {
  const session = ctx.sessions?.[sessionID];
  if (!session || ctx._listenerStopped || session.closing) return false;
  const pending = ctx._pendingRefreshFingerprintBySession?.get(session);
  if (!pending || pending.sessionID !== sessionID) return false;
  if (ctx._lastSyncFailedBySession?.get(session) === true) return false;
  if (hasPendingOrFailedTagSync(ctx, sessionID) || hasPendingOrFailedViewRefresh(ctx)) return false;
  if ((ctx._sessionUpdateRevision?.[sessionID] || 0) !== pending.revision) return false;

  ctx._lastRefreshFingerprintBySession ??= new WeakMap();
  ctx._lastRefreshFingerprintBySession.set(session, pending.fingerprint);
  ctx._pendingRefreshFingerprintBySession?.delete(session);
  return true;
}

export function markTagSyncOutcome(ctx: SyncCompletionContext, sessionID: string, succeeded: boolean): void {
  if (!succeeded) {
    ctx._tagSyncFailedBySession ??= {};
    if (sessionID.startsWith("__")) {
      for (const [sid, session] of Object.entries(ctx.sessions || {})) {
        ctx._tagSyncFailedBySession[sid] = true;
        markSessionSyncFailed(ctx, session);
      }
      return;
    }
    ctx._tagSyncFailedBySession[sessionID] = true;
    markSessionSyncFailed(ctx, ctx.sessions?.[sessionID]);
    return;
  }

  if (sessionID.startsWith("__")) {
    ctx._tagSyncFailedBySession = {};
    for (const sid of Object.keys(ctx.sessions || {})) {
      tryCommitSessionFingerprint(ctx, sid);
    }
    return;
  }

  if (ctx._tagSyncFailedBySession) delete ctx._tagSyncFailedBySession[sessionID];
  tryCommitSessionFingerprint(ctx, sessionID);
}

export function markViewRefreshOutcome(
  ctx: SyncCompletionContext,
  target: Set<number> | "full" | null,
  succeeded: boolean
): void {
  if (!succeeded) {
    ctx._viewRefreshFailed = true;
    if (target === "full" || ctx._failedItemsViewRefreshTarget === "full") {
      ctx._failedItemsViewRefreshTarget = "full";
    } else if (target instanceof Set && target.size > 0) {
      const merged = ctx._failedItemsViewRefreshTarget instanceof Set
        ? ctx._failedItemsViewRefreshTarget
        : new Set<number>();
      for (const id of target) merged.add(id);
      ctx._failedItemsViewRefreshTarget = merged;
    } else if (!ctx._failedItemsViewRefreshTarget) {
      ctx._failedItemsViewRefreshTarget = "full";
    }
    for (const session of Object.values(ctx.sessions || {})) {
      markSessionSyncFailed(ctx, session);
    }
    return;
  }

  ctx._viewRefreshFailed = false;
  ctx._failedItemsViewRefreshTarget = null;
  for (const sid of Object.keys(ctx.sessions || {})) {
    tryCommitSessionFingerprint(ctx, sid);
  }
}
