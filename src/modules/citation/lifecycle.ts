import type { CitationSharedState } from "./state-contract.ts";
type HostMethod = (...args: never[]) => unknown;
interface LifecycleContext extends CitationSharedState {
  _clearPromise?: Promise<void>; _getSessionWrapper?: HostMethod | null; _originalGetSession?: HostMethod | null;
  _execCommandWrapper?: HostMethod | null; _originalExecCommand?: HostMethod | null; _isExecCommandHooked?: boolean;
  _listenerStopped: boolean; _isExecCommandRunning: boolean; _execCommandDepth: number;
  _itemsViewRefreshTimer?: number | null; _listenerTimer?: number | null;
  _lastRefreshAt: Record<string, unknown>;
  _lastTagSyncSig: Record<string, unknown>; _sessionCitedIDs: Record<string, unknown>;
  _managedCitationTagIDs: Record<string, unknown>; _tagSyncInFlightBySession: Record<string, Promise<unknown>>;
  _pendingTagSyncIDsBySession: Record<string, unknown>; _tagSyncTimerBySession: Record<string, number>;
  _sessionUpdateQueue: Record<string, unknown>;
  _emptyReadCountBySession: Record<string, unknown>; _missingSessionCountBySession: Record<string, unknown>;
  _docIdBySession: Record<string, unknown>; _pendingCollectionNumber: number;
  _execCommandBindings: Map<unknown, unknown>; _collectionRenameRetryTimerBySession: Record<string, number>;
  _collectionRenameRetryCountBySession: Record<string, number>; _refreshRetryTimerBySession: Record<string, number>;
  _listenerTickTask?: Promise<unknown>; _initializationTasks?: Map<unknown, Promise<unknown>>;
  _activeRefreshTasks?: Set<Promise<unknown>>; _tagSyncQueue?: Promise<unknown>;
  _lastRefreshFingerprintBySession?: WeakMap<object, string>; _pendingRefreshFingerprintBySession?: WeakMap<object, unknown>;
  _lastSyncFailedBySession?: WeakMap<object, boolean>; _tagSyncFailedBySession?: Record<string, boolean>;
  _pendingItemsViewRefreshIDs?: Set<number> | "full" | null; _itemsViewRefreshInFlight?: boolean;
  _viewRefreshFailed?: boolean; _failedItemsViewRefreshTarget?: Set<number> | "full" | null;
  _isListenerBackedOff?: boolean;
  _activityEpoch?: number; _idleTickCount?: number; _lastBgWindowProbeAt?: number; _pendingStartupTagCleanup?: boolean;
  _scheduleListenerTick?: ((delay: number) => void) | null;
  _performClear(): Promise<void>; _restoreWordIntegrationHooks(): void; _resetInternalTrackingMaps(): void;
  _setActiveSessionID(id: string | null): void; _bumpDebugCounter(name: string): void;
  _clearCollectionRenameRetry(id: string): void; syncCitationTags(id: string, items: number[]): Promise<unknown>;
  clearSession(id: string, remove: boolean): Promise<unknown>; logError(message: string, error: unknown): void;
}
declare function clearTimeout(handle: number): void;
// ============================================================================
// Lifecycle Teardown & Resource Disposal
// ============================================================================

export class CitationLifecycle {
  /**
   * Idempotently initiates citation coordinator teardown.
   * @returns {Promise<void>}
   */
  clear(this: LifecycleContext): Promise<void> {
    if (!this._clearPromise) this._clearPromise = this._performClear();
    return this._clearPromise;
  }

  /**
   * Restores integration.getSession and execCommand wrappers during shutdown.
   * @private
   */
  _restoreWordIntegrationHooks(this: LifecycleContext): void {
    const integration = Zotero.Integration as unknown as { getSession?: HostMethod | null; execCommand?: HostMethod | null };
    if (this._getSessionWrapper && integration.getSession === this._getSessionWrapper) {
      integration.getSession = this._originalGetSession;
    }
    this._getSessionWrapper = null;
    this._originalGetSession = null;

    if (this._isExecCommandHooked && this._originalExecCommand
      && integration.execCommand === this._execCommandWrapper) {
      integration.execCommand = this._originalExecCommand;
      this._isExecCommandHooked = false;
      this._originalExecCommand = null;
      this._execCommandWrapper = null;
      this._bumpDebugCounter("execHookRestored");
    } else if (this._isExecCommandHooked) {
      this._isExecCommandHooked = false;
      this._originalExecCommand = null;
      this._execCommandWrapper = null;
    }
  }

  /**
   * Clears all internal tracking caches, timer maps, and session records after teardown.
   * @private
   */
  _resetInternalTrackingMaps(this: LifecycleContext): void {
    try {
      if (this._itemsViewRefreshTimer) {
        clearTimeout(this._itemsViewRefreshTimer);
        this._itemsViewRefreshTimer = null;
      }
      this._sortedCacheBySession = {};
      this._lastRefreshAt = {};
      this._lastTagSyncSig = {};
      this._sessionCitedIDs = {};
      this._managedCitationTagIDs = {};
      this._tagSyncInFlightBySession = {};
      this._pendingTagSyncIDsBySession = {};
      this._tagSyncTimerBySession = {};
      this._sessionUpdateQueue = {};
      this._sessionUpdateRevision = {};
      this._emptyReadCountBySession = {};
      this._missingSessionCountBySession = {};
      this._docIdBySession = {};
      this._pendingCollectionNames?.clear?.();
      this._pendingCollectionNumber = 0;
      this._execCommandBindings.clear();
      this._collectionRenameRetryTimerBySession = {};
      this._collectionRenameRetryCountBySession = {};
      for (const sessionID in this._refreshRetryTimerBySession) {
        clearTimeout(this._refreshRetryTimerBySession[sessionID]);
      }
      this._refreshRetryTimerBySession = {};
      this._lastRefreshFingerprintBySession = new WeakMap();
      this._pendingRefreshFingerprintBySession = new WeakMap();
      this._lastSyncFailedBySession = new WeakMap();
      this._tagSyncFailedBySession = {};
      this._pendingItemsViewRefreshIDs = null;
      this._itemsViewRefreshInFlight = false;
      this._viewRefreshFailed = false;
      this._failedItemsViewRefreshTarget = null;
      this._isListenerBackedOff = false;
      this._activityEpoch = 0;
      this._idleTickCount = 0;
      this._lastBgWindowProbeAt = 0;
      this._pendingStartupTagCleanup = false;
      this._scheduleListenerTick = null;
    } catch {}
  }

  /**
   * Performs full teardown: restores wrappers, stops timers, clears tags and collections.
   * @returns {Promise<void>}
   * @private
   */
  async _performClear(this: LifecycleContext): Promise<void> {
    this._listenerStopped = true;
    this._setActiveSessionID(null);
    this._isExecCommandRunning = false;
    this._execCommandDepth = 0;

    this._restoreWordIntegrationHooks();

    for (const sessionID of Object.keys(this._collectionRenameRetryTimerBySession || {})) {
      this._clearCollectionRenameRetry(sessionID);
    }
    if (this._listenerTimer) {
      clearTimeout(this._listenerTimer);
      this._listenerTimer = null;
    }

    await Promise.allSettled([
      this._listenerTickTask,
      ...this._initializationTasks?.values() || [],
      ...this._activeRefreshTasks || []
    ].filter(Boolean));

    for (const sessionID in this._tagSyncTimerBySession) {
      clearTimeout(this._tagSyncTimerBySession[sessionID]);
    }
    this._tagSyncTimerBySession = {};
    this._pendingTagSyncIDsBySession = {};

    const tagTasks = [...Object.values(this._tagSyncInFlightBySession), this._tagSyncQueue].filter(t => t && typeof t.then === "function");
    if (tagTasks.length) await Promise.allSettled(tagTasks);

    this._sessionCitedIDs = {};
    try {
      await this.syncCitationTags("__shutdown__", []);
    } catch (error) {
      this.logError("Failed to remove managed citation tags during shutdown", error);
    }

    const sessionIDs = Object.keys(this.sessions || {});
    const cleanupResults = await Promise.allSettled(sessionIDs.map(id => this.clearSession(id, true)));
    for (const result of cleanupResults) {
      if (result.status === "rejected") {
        this.logError("Failed to remove a Word citation collection during shutdown", result.reason);
      }
    }

    this._resetInternalTrackingMaps();
  }
}
