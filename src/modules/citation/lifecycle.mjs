// ============================================================================
// Lifecycle Teardown & Resource Disposal
// ============================================================================

export class CitationLifecycle {
  /**
   * Idempotently initiates citation coordinator teardown.
   * @returns {Promise<void>}
   */
  clear() {
    if (!this._clearPromise) this._clearPromise = this._performClear();
    return this._clearPromise;
  }

  /**
   * Restores Zotero.Integration.getSession and execCommand wrappers during shutdown.
   * @private
   */
  _restoreWordIntegrationHooks() {
    if (this._getSessionWrapper && Zotero.Integration.getSession === this._getSessionWrapper) {
      Zotero.Integration.getSession = this._originalGetSession;
    }
    this._getSessionWrapper = null;
    this._originalGetSession = null;

    if (this._isExecCommandHooked && this._originalExecCommand
      && Zotero.Integration.execCommand === this._execCommandWrapper) {
      Zotero.Integration.execCommand = this._originalExecCommand;
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
  _resetInternalTrackingMaps() {
    try {
      if (this._itemsViewRefreshTimer) {
        globalThis.clearTimeout(this._itemsViewRefreshTimer);
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
      this._execCommandBindings.clear();
      this._collectionRenameRetryTimerBySession = {};
      this._collectionRenameRetryCountBySession = {};
      for (const sessionID in this._refreshRetryTimerBySession) {
        globalThis.clearTimeout(this._refreshRetryTimerBySession[sessionID]);
      }
      this._refreshRetryTimerBySession = {};
    } catch {}
  }

  /**
   * Performs full teardown: restores wrappers, stops timers, clears tags and collections.
   * @returns {Promise<void>}
   * @private
   */
  async _performClear() {
    this._listenerStopped = true;
    this._setActiveSessionID(null);
    this._isExecCommandRunning = false;
    this._execCommandDepth = 0;

    this._restoreWordIntegrationHooks();

    for (const sessionID of Object.keys(this._collectionRenameRetryTimerBySession || {})) {
      this._clearCollectionRenameRetry(sessionID);
    }
    if (this._listenerTimer) {
      globalThis.clearTimeout(this._listenerTimer);
      this._listenerTimer = null;
    }

    await Promise.allSettled([
      this._listenerTickTask,
      ...this._initializationTasks?.values() || [],
      ...this._activeRefreshTasks || []
    ].filter(Boolean));

    for (const sessionID in this._tagSyncTimerBySession) {
      globalThis.clearTimeout(this._tagSyncTimerBySession[sessionID]);
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
