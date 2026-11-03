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
   * Validates whether a citation index key represents a non-negative safe integer.
   * Prevents NaN comparator corruption in Array.prototype.sort.
   * @param {string} key - Object key from citationsByIndex
   * @returns {boolean}
   * @private
   */
  _isValidCitationIndexKey(key) {
    if (typeof key !== "string" || !/^\d+$/.test(key)) return false;
    const num = Number(key);
    return Number.isSafeInteger(num) && num >= 0;
  }

  /**
   * Parses and validates a positive safe integer item ID from a citation item entry.
   * @param {unknown} rawId - Raw item ID
   * @returns {number|null} Positive integer ID or null
   * @private
   */
  _parseValidItemID(rawId) {
    if (typeof rawId === "number") {
      return Number.isSafeInteger(rawId) && rawId > 0 ? rawId : null;
    }
    if (typeof rawId === "string") {
      const trimmed = rawId.trim();
      if (!/^\d+$/.test(trimmed)) return null;
      const num = Number(trimmed);
      return Number.isSafeInteger(num) && num > 0 ? num : null;
    }
    return null;
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
   * Caches sort signature and cloned result array for a session with bounded eviction.
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
    const maxSessions = this._maxSortedCacheSessions || 64;
    const existingKeys = Object.keys(this._sortedCacheBySession);
    if (!(key in this._sortedCacheBySession) && existingKeys.length >= maxSessions) {
      delete this._sortedCacheBySession[existingKeys[0]];
    }
    this._sortedCacheBySession[key] = { sig, result: [...result] };
  }

  /**
   * Extracts and sorts item IDs according to their exact order of appearance in the Word document.
   * @param {object} citationsByIndex - Native citation index dictionary
   * @param {string} sessionID - Session identifier
   * @returns {number[]} Sorted unique item IDs
   */
  getSortedItemIDs(citationsByIndex, sessionID) {
    const perfStart = Date.now();
    citationsByIndex ??= {};
    try {
      const indexKeys = Object.keys(citationsByIndex)
        .filter(key => this._isValidCitationIndexKey(key))
        .sort((a, b) => Number(a) - Number(b));
      const parts = [];
      const seenIDs = new Set();
      const sortedItemIDs = [];

      for (const key of indexKeys) {
        const values = [];
        const items = Array.isArray(citationsByIndex[key]?.citationItems)
          ? citationsByIndex[key].citationItems
          : [];
        for (const item of items) {
          if (!item) continue;
          const id = this._parseValidItemID(item.id);
          if (id === null) continue;
          const zotItem = typeof Zotero !== "undefined" && typeof Zotero.Items?.get === "function"
            ? Zotero.Items.get(id)
            : null;
          if (zotItem && (zotItem.deleted === true || zotItem.inTrash === true)) continue;
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
