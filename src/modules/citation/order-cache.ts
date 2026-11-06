import type { CitationSharedState, CitationSortCache as Cache } from "./state-contract.ts";
import { isValidCitationIndexKey, parseValidItemID } from "./id-validation.ts";

type CitationIndex = Record<string, { citationItems?: Array<{ id?: unknown } | null> }>;
interface OrderContext extends Partial<CitationSharedState> {
  _maxSortedCacheSessions?: number;
  activeSessionID?: string | null;
  _docIdBySession?: Record<string, unknown>; _lastRefreshAt?: Record<string, unknown>;
  _lastTagSyncSig?: Record<string, unknown>; _sessionCitedIDs?: Record<string, unknown>;
  _tagSyncInFlightBySession?: Record<string, unknown>; _pendingTagSyncIDsBySession?: Record<string, unknown>;
  _emptyReadCountBySession?: Record<string, unknown>; _missingSessionCountBySession?: Record<string, unknown>;
  _sessionUpdateQueue?: Record<string, unknown>; _refreshRetryTimerBySession?: Record<string, number>;
  _tagSyncTimerBySession?: Record<string, number>;
  _getSortedCacheKey(id: string): string; _isValidCitationIndexKey(key: string): boolean;
  _parseValidItemID(id: unknown): number | null; _getSortedCache(id: string): Cache | undefined;
  _setSortedCache(id: string, sig: string, result: number[]): void;
  _clearCollectionRenameRetry(id: string): void; _invalidateSessionIndex(): void;
  _setActiveSessionID(id: string | null): void; debugLog(...args: unknown[]): void;
  _recordPerf(key: string, duration: number): void;
}
declare function clearTimeout(handle: number): void;
declare const runtime: { log(...args: unknown[]): void };
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
  _getSortedCacheKey(sessionID: string): string {
    return `cache_${sessionID}`;
  }

  /**
   * Validates whether a citation index key represents a non-negative safe integer.
   * Prevents NaN comparator corruption in Array.prototype.sort.
   * @param {string} key - Object key from citationsByIndex
   * @returns {boolean}
   * @private
   */
  _isValidCitationIndexKey(key: string): boolean {
    return isValidCitationIndexKey(key);
  }

  /**
   * Parses and validates a positive safe integer item ID from a citation item entry.
   * @param {unknown} rawId - Raw item ID
   * @returns {number|null} Positive integer ID or null
   * @private
   */
  _parseValidItemID(rawId: unknown): number | null {
    return parseValidItemID(rawId);
  }

  /**
   * Retrieves and validates cached sort signature and item IDs for a session.
   * @param {string} sessionID - Session identifier
   * @returns {object|undefined}
   * @private
   */
  _getSortedCache(this: OrderContext, sessionID: string): Cache | undefined {
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
  _setSortedCache(this: OrderContext, sessionID: string, sig: string, result: number[]): void {
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
   * Checks whether a non-empty citationsByIndex snapshot had valid item IDs that were all trashed/deleted.
   * Distinguishes all-trashed documents from malformed snapshots.
   * @param {object} citationsByIndex - Native citation index dictionary
   * @returns {boolean}
   * @private
   */
  _hasOnlyTrashedCitationItems(this: OrderContext, citationsByIndex: CitationIndex): boolean {
    if (!citationsByIndex || typeof citationsByIndex !== "object") return false;
    let sawValidID = false;
    for (const key of Object.keys(citationsByIndex)) {
      if (!this._isValidCitationIndexKey(key)) continue;
      const items = citationsByIndex[key]?.citationItems;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const id = this._parseValidItemID(item?.id);
        if (id === null) continue;
        sawValidID = true;
        const zotItem = (typeof Zotero !== "undefined" && typeof Zotero.Items?.get === "function"
          ? Zotero.Items.get(id)
          : null) as { deleted?: boolean; inTrash?: boolean } | null;
        if (!zotItem || (zotItem.deleted !== true && zotItem.inTrash !== true)) {
          return false;
        }
      }
    }
    return sawValidID;
  }

  /**
   * Extracts and sorts item IDs according to their exact order of appearance in the Word document.
   * @param {object} citationsByIndex - Native citation index dictionary
   * @param {string} sessionID - Session identifier
   * @returns {number[]} Sorted unique item IDs
   */
  getSortedItemIDs(this: OrderContext, citationsByIndex: CitationIndex, sessionID: string): number[] {
    const perfStart = Date.now();
    citationsByIndex ??= {};
    try {
      const indexKeys = Object.keys(citationsByIndex)
        .filter(key => this._isValidCitationIndexKey(key))
        .sort((a, b) => Number(a) - Number(b));
      const parts = [];
      const seenIDs = new Set<number>();
      const sortedItemIDs: number[] = [];

      for (const key of indexKeys) {
        const values: number[] = [];
        const items = Array.isArray(citationsByIndex[key]?.citationItems)
          ? citationsByIndex[key].citationItems
          : [];
        for (const item of items) {
          if (!item) continue;
          const id = this._parseValidItemID(item.id);
          if (id === null) continue;
          const zotItem = (typeof Zotero !== "undefined" && typeof Zotero.Items?.get === "function"
            ? Zotero.Items.get(id)
            : null) as { deleted?: boolean; inTrash?: boolean } | null;
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
  cleanupSessionState(this: OrderContext, sessionID: string, removeSession = true): void {
    this._clearCollectionRenameRetry(sessionID);
    if (removeSession && this.sessions) {
      delete this.sessions[sessionID];
      this._invalidateSessionIndex();
    }
    if (this._docIdBySession) delete this._docIdBySession[sessionID];
    if (this.activeSessionID === sessionID) this._setActiveSessionID(null);
    if (this._lastRefreshAt) delete this._lastRefreshAt[sessionID];
    if (this._lastTagSyncSig) delete this._lastTagSyncSig[sessionID];
    if (this._sessionCitedIDs) delete this._sessionCitedIDs[sessionID];
    if (this._tagSyncInFlightBySession) delete this._tagSyncInFlightBySession[sessionID];
    if (this._pendingTagSyncIDsBySession) delete this._pendingTagSyncIDsBySession[sessionID];
    if (this._emptyReadCountBySession) delete this._emptyReadCountBySession[sessionID];
    if (this._missingSessionCountBySession) delete this._missingSessionCountBySession[sessionID];
    this._pendingCollectionNames?.delete(sessionID);
    if (this._sessionUpdateRevision) {
      this._sessionUpdateRevision[sessionID] = (this._sessionUpdateRevision[sessionID] || 0) + 1;
    }
    if (this._sessionUpdateQueue) delete this._sessionUpdateQueue[sessionID];

    if (this._refreshRetryTimerBySession?.[sessionID]) {
      clearTimeout(this._refreshRetryTimerBySession[sessionID]);
      delete this._refreshRetryTimerBySession[sessionID];
    }
    if (this._tagSyncTimerBySession?.[sessionID]) {
      clearTimeout(this._tagSyncTimerBySession[sessionID]);
      delete this._tagSyncTimerBySession[sessionID];
    }
    const cacheKey = this._getSortedCacheKey(sessionID);
    if (this._sortedCacheBySession) delete this._sortedCacheBySession[cacheKey];
  }
}
