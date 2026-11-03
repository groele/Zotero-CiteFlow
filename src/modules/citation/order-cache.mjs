// ============================================================================
// Citation Sorting, Signature Cache & Session State Cleanup
// ============================================================================

export class CitationOrderCache {
  /**
   * Formats a cache key string for session item sort signatures.
   * @param {string} sessionID - Session identifier
   * @returns {string} Cache key
   * @private
   */
  _getSortedCacheKey(sessionID) {
    return `cache_${sessionID}`;
  }

  /**
   * Retrieves and validates cached sort signature and item IDs for a session.
   * @param {string} sessionID - Session identifier
   * @returns {object|undefined}
   * @private
   */
  _getSortedCache(sessionID) {
    if (!this._sortedCacheBySession || typeof this._sortedCacheBySession !== "object") return undefined;
    const key = this._getSortedCacheKey(sessionID);
    const cache = this._sortedCacheBySession[key];
    if (!cache || typeof cache.sig !== "string" || !Array.isArray(cache.result)
      || cache.result.some(id => !Number.isSafeInteger(id) || id <= 0)) {
      return undefined;
    }
    return cache;
  }

  /**
   * Caches sort signature and cloned result array for a session.
   * @param {string} sessionID - Session identifier
   * @param {string} sig - Signature hash string
   * @param {number[]} result - Sorted item IDs
   * @private
   */
  _setSortedCache(sessionID, sig, result) {
    if (!this._sortedCacheBySession || typeof this._sortedCacheBySession !== "object") {
      this._sortedCacheBySession = {};
    }
    const key = this._getSortedCacheKey(sessionID);
    this._sortedCacheBySession[key] = { sig, result: [...result] };
  }

  /**
   * Extracts and sorts item IDs according to their order of appearance in the Word document.
   * @param {object} citationsByIndex - Native citation index dictionary
   * @param {string} sessionID - Session identifier
   * @returns {number[]} Sorted unique item IDs
   */
  getSortedItemIDs(citationsByIndex, sessionID) {
    const perfStart = Date.now();
    citationsByIndex ??= {};
    try {
      const indexKeys = Object.keys(citationsByIndex).sort((a, b) => Number(a) - Number(b));
      const parts = [];
      const seenIDs = new Set();
      const sortedItemIDs = [];

      for (const key of indexKeys) {
        const values = [];
        const items = Array.isArray(citationsByIndex[key]?.citationItems)
          ? citationsByIndex[key].citationItems
          : [];
        for (const item of items) {
          if (!item || (typeof item.id !== "number" && typeof item.id !== "string")) continue;
          const id = Number(item.id);
          if (!Number.isSafeInteger(id) || id <= 0) continue;
          values.push(id);
          if (!seenIDs.has(id)) {
            seenIDs.add(id);
            sortedItemIDs.push(id);
          }
        }
        parts.push(key + ":" + values.join(",") + ";");
      }

      const sig = parts.join("") || "_empty";
      const cache = this._getSortedCache(sessionID);
      if (cache?.sig === sig) return [...cache.result];

      this._setSortedCache(sessionID, sig, sortedItemIDs);
      this.debugLog("[Citation getSortedItemIDs] Session:", sessionID, "Items:", sortedItemIDs.length);
      return sortedItemIDs;
    } catch (e) {
      runtime?.log?.("[Citation] ERROR in getSortedItemIDs:", e);
      const cache = this._getSortedCache(sessionID);
      return cache?.result ? [...cache.result] : [];
    } finally {
      this._recordPerf("getSortedItemIDs", Date.now() - perfStart);
    }
  }

  /**
   * Resets and cleans up session-level caches, timers, and tracking records.
   * @param {string} sessionID - Session identifier
   * @param {boolean} [removeSession=true] - Whether to delete session from this.sessions
   */
  cleanupSessionState(sessionID, removeSession = true) {
    this._clearCollectionRenameRetry(sessionID);
    if (removeSession && this.sessions) {
      delete this.sessions[sessionID];
      this._invalidateSessionIndex();
    }
    delete this._docIdBySession[sessionID];
    if (this.activeSessionID === sessionID) this._setActiveSessionID(null);
    delete this._lastRefreshAt[sessionID];
    delete this._lastTagSyncSig[sessionID];
    delete this._sessionCitedIDs[sessionID];
    delete this._tagSyncInFlightBySession[sessionID];
    delete this._pendingTagSyncIDsBySession[sessionID];
    delete this._emptyReadCountBySession[sessionID];
    delete this._missingSessionCountBySession[sessionID];
    this._sessionUpdateRevision[sessionID] = (this._sessionUpdateRevision[sessionID] || 0) + 1;
    delete this._sessionUpdateQueue[sessionID];

    if (this._refreshRetryTimerBySession[sessionID]) {
      globalThis.clearTimeout(this._refreshRetryTimerBySession[sessionID]);
      delete this._refreshRetryTimerBySession[sessionID];
    }
    if (this._tagSyncTimerBySession[sessionID]) {
      globalThis.clearTimeout(this._tagSyncTimerBySession[sessionID]);
      delete this._tagSyncTimerBySession[sessionID];
    }
    const cacheKey = this._getSortedCacheKey(sessionID);
    delete this._sortedCacheBySession[cacheKey];
  }
}
