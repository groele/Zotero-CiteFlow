import { TEMP_COLLECTION_KEYS_PREF } from "./constants.mjs";

// ============================================================================
// Citation Formatting, Snapshot Refresh & Tree View Refresh
// ============================================================================

export class CitationFormatting {
  /**
   * Schedules a debounced session refresh after retry delay.
   * @param {string} sessionID - Session identifier
   * @param {object} targetSession - Word session
   * @param {number} [delayMs=180] - Debounce delay in milliseconds
   * @private
   */
  _scheduleSessionRefresh(sessionID, targetSession, delayMs = 180) {
    if (this._listenerStopped || this._refreshRetryTimerBySession[sessionID]) return;
    this._refreshRetryTimerBySession[sessionID] = globalThis.setTimeout(() => {
      delete this._refreshRetryTimerBySession[sessionID];
      if (this._listenerStopped || !this.sessions?.[sessionID]) return;
      void this.refreshSessionCitations(sessionID, targetSession).catch(error => this.logError("Failed to retry citation refresh", error));
    }, Math.max(50, delayMs));
  }

  /**
   * Terminates and cleans up an individual Word session.
   * @param {string} sessionID - Session identifier
   * @param {boolean} [skipTagCleanup=false] - Whether to bypass tag removal
   * @returns {Promise<void>}
   */
  async clearSession(sessionID, skipTagCleanup = false) {
    const session = this.sessions?.[sessionID];
    if (!session) return;
    session.closing = true;
    this._sessionUpdateRevision[sessionID] = (this._sessionUpdateRevision[sessionID] || 0) + 1;
    await Promise.allSettled([session._renameTask, this._sessionUpdateQueue[sessionID]].filter(Boolean));

    if (this._tagSyncTimerBySession[sessionID]) {
      globalThis.clearTimeout(this._tagSyncTimerBySession[sessionID]);
      delete this._tagSyncTimerBySession[sessionID];
    }
    delete this._pendingTagSyncIDsBySession[sessionID];
    delete this._sessionCitedIDs[sessionID];

    if (!skipTagCleanup) {
      const tagTask = this._tagSyncInFlightBySession[sessionID];
      if (tagTask && typeof tagTask.then === "function") await Promise.allSettled([tagTask]);
      try {
        await this.syncCitationTags(sessionID, []);
      } catch (error) {
        this.logError(`Failed to update citation tags while closing ${sessionID}`, error);
      }
    }
    this.cleanupSessionState(sessionID, true);
    const collection = session.collection;
    if (!collection?.id) return;
    try {
      await collection.eraseTx();
      this._temporaryCollectionKeys.delete(collection.key);
      this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);
    } catch (error) {
      this.logError(`Failed to remove Word citation collection ${collection.name || collection.key}`, error);
    }
  }

  /**
   * Public entry point for refreshing session citations with task tracking.
   * @param {string} sessionID - Session identifier
   * @param {object} [session] - Optional native session object
   * @returns {Promise<void>}
   */
  async refreshSessionCitations(sessionID, session) {
    const task = this._refreshSessionCitations(sessionID, session);
    (this._activeRefreshTasks ??= new Set()).add(task);
    try {
      return await task;
    } finally {
      this._activeRefreshTasks.delete(task);
    }
  }

  /**
   * Reads citationsByItemID and citationsByIndex from the native Word session,
   * retrying once on bidirectional torn-snapshot mismatch (index empty while itemMap non-empty, or vice versa).
   * @param {object} targetSession - Native Word session
   * @returns {Promise<{ citationsByItemID: object, citationsByIndex: object, transientMismatch: boolean }>}
   * @private
   */
  async _readSessionCitationSnapshots(targetSession) {
    let citationsByItemID = targetSession.citationsByItemID;
    let citationsByIndex = targetSession.citationsByIndex;

    if (!citationsByItemID || typeof citationsByItemID !== "object") {
      await targetSession.updateFromDocument(0);
      citationsByItemID = targetSession.citationsByItemID || {};
    }
    if (!citationsByIndex || typeof citationsByIndex !== "object") {
      await targetSession.updateFromDocument(0);
      citationsByIndex = targetSession.citationsByIndex || {};
    }

    const indexEmpty = Object.keys(citationsByIndex).length === 0;
    const itemMapEmpty = Object.keys(citationsByItemID).length === 0;
    if (indexEmpty !== itemMapEmpty) {
      await Zotero.Promise.delay(50);
      await targetSession.updateFromDocument?.(0);
      citationsByIndex = targetSession.citationsByIndex || {};
      citationsByItemID = targetSession.citationsByItemID || {};
      const retryIndexEmpty = Object.keys(citationsByIndex).length === 0;
      const retryItemMapEmpty = Object.keys(citationsByItemID).length === 0;
      if (retryIndexEmpty !== retryItemMapEmpty) {
        return { citationsByItemID, citationsByIndex, transientMismatch: true };
      }
    }
    return { citationsByItemID, citationsByIndex, transientMismatch: false };
  }

  /**
   * Handles empty citation index snapshots with two-read confirmation before clearing session state.
   * @param {string} sessionID - Session identifier
   * @param {object} targetSession - Native Word session
   * @param {object} citationsByItemID - Current item citation map
   * @returns {Promise<void>}
   * @private
   */
  async _handleEmptyCitationSnapshot(sessionID, targetSession, citationsByItemID) {
    const emptyItemMap = Object.keys(citationsByItemID).length === 0;
    if (!emptyItemMap) {
      this._emptyReadCountBySession[sessionID] = 0;
      this._scheduleSessionRefresh(sessionID, targetSession, 250);
      return;
    }
    const emptyReadCount = (this._emptyReadCountBySession[sessionID] || 0) + 1;
    this._emptyReadCountBySession[sessionID] = emptyReadCount;
    if (emptyReadCount < 2) {
      this._scheduleSessionRefresh(sessionID, targetSession, 250);
      return;
    }
    this.scheduleCitationTagSync(sessionID, [], true);
    await this.updateCitations(sessionID, {}, [], targetSession.styleClass);
  }

  /**
   * Refreshes citation data from the Word document and dispatches tag/view updates.
   * @param {string} sessionID - Session identifier
   * @param {object} session - Native Word session object
   * @returns {Promise<void>}
   * @private
   */
  async _refreshSessionCitations(sessionID, session) {
    const perfStart = Date.now();
    if (this._listenerStopped || !this.sessions?.[sessionID] || this.sessions[sessionID].closing) return;
    const targetSession = session || Zotero.Integration.sessions[sessionID];
    if (!targetSession) return;

    this._refreshStateBySession ??= new WeakMap();
    let refreshState = this._refreshStateBySession.get(targetSession);
    if (!refreshState) {
      refreshState = {};
      this._refreshStateBySession.set(targetSession, refreshState);
    }
    if (refreshState.syncing) {
      refreshState.pending = true;
      return;
    }

    try {
      const now = Date.now();
      const last = this._lastRefreshAt[sessionID] || 0;
      if (now - last < this._minRefreshInterval) {
        this._scheduleSessionRefresh(sessionID, targetSession, this._minRefreshInterval - (now - last) + 25);
        return;
      }
      this._lastRefreshAt[sessionID] = now;
    } catch {}

    refreshState.syncing = true;
    try {
      const { citationsByItemID, citationsByIndex, transientMismatch } = await this._readSessionCitationSnapshots(targetSession);
      if (transientMismatch) {
        this._emptyReadCountBySession[sessionID] = 0;
        this._scheduleSessionRefresh(sessionID, targetSession, 250);
        return;
      }

      if (Object.keys(citationsByIndex).length === 0) {
        await this._handleEmptyCitationSnapshot(sessionID, targetSession, citationsByItemID);
        return;
      }

      this._emptyReadCountBySession[sessionID] = 0;
      const sortedItemIDs = this.getSortedItemIDs(citationsByIndex, sessionID);
      if (this._listenerStopped || !this.sessions?.[sessionID]) return;
      if (!Array.isArray(sortedItemIDs) || sortedItemIDs.length === 0) return;

      this.scheduleCitationTagSync(sessionID, sortedItemIDs);
      await this.updateCitations(sessionID, citationsByItemID, sortedItemIDs, targetSession.styleClass);
    } catch (e) {
      this.logError("Citation snapshot refresh failed", e);
    } finally {
      refreshState.syncing = false;
      if (refreshState.pending) {
        refreshState.pending = false;
        this._scheduleSessionRefresh(sessionID, targetSession, this._minRefreshInterval);
      }
      this._recordPerf("refreshSessionCitations", Date.now() - perfStart);
    }
  }

  /**
   * Schedules a debounced refresh of the citation column in all open Zotero windows.
   */
  scheduleItemsViewRefresh() {
    if (this._itemsViewRefreshTimer || this._listenerStopped) return;
    this._itemsViewRefreshTimer = globalThis.setTimeout(async () => {
      this._itemsViewRefreshTimer = null;
      if (this._listenerStopped) return;
      const panes = Zotero.getMainWindows?.().map(win => win.ZoteroPane) || [globalThis.ZoteroPane];
      const seenViews = new Set();
      for (const pane of panes) {
        const itemsView = pane?.itemsView;
        if (!itemsView || seenViews.has(itemsView)) continue;
        seenViews.add(itemsView);
        try {
          await itemsView.refreshAndMaintainSelection();
        } catch (error) {
          this.logError("Cannot refresh the citation column", error);
        }
      }
    }, this._itemsViewRefreshDebounceMs);
  }

  /**
   * Queues an asynchronous citation update with revision tracking.
   * @param {string} sessionID - Session identifier
   * @param {object} citationsByItemID - Citations indexed by item ID
   * @param {number[]} sortedItemIDs - Sorted document item order
   * @param {string} styleClass - Citation style class ("note" or "in-text")
   * @returns {Promise<void>}
   */
  async updateCitations(sessionID, citationsByItemID, sortedItemIDs, styleClass) {
    if (this._listenerStopped || !this.sessions?.[sessionID] || this.sessions[sessionID].closing) return;
    if (citationsByItemID && typeof citationsByItemID === "object") {
      citationsByItemID = Object.fromEntries(Object.entries(citationsByItemID).map(([id, values]) => [
        id,
        Array.isArray(values) ? values.map(value => ({ properties: { plainCitation: value?.properties?.plainCitation } })) : values
      ]));
    }
    if (Array.isArray(sortedItemIDs)) sortedItemIDs = [...sortedItemIDs];
    const revision = (this._sessionUpdateRevision[sessionID] || 0) + 1;
    this._sessionUpdateRevision[sessionID] = revision;
    const previous = this._sessionUpdateQueue[sessionID] || Promise.resolve();

    const task = previous.catch(error => {
      this.logError(`Previous citation update failed for ${sessionID}`, error);
    }).then(async () => {
      if (this._listenerStopped || !this.sessions?.[sessionID] || this._sessionUpdateRevision[sessionID] !== revision) return;
      await this._applyCitations(sessionID, citationsByItemID, sortedItemIDs, styleClass, revision);
    });

    this._sessionUpdateQueue[sessionID] = task;
    try {
      await task;
    } finally {
      if (this._sessionUpdateQueue[sessionID] === task) delete this._sessionUpdateQueue[sessionID];
    }
  }

  /**
   * Formats the plain citation label for a single item ID based on document ordinal and style class.
   * @private
   */
  _formatItemPlainCitation(id, idIndexMap, citationsByItemID, oldIdData, isNoteStyle) {
    const index = idIndexMap.get(Number(id));
    if (index === undefined) {
      return oldIdData[id]?.plainCitation || (isNoteStyle ? "—" : "—: (pending)");
    }
    const order = index + 1;
    if (isNoteStyle) return String(order);
    const citations = citationsByItemID[id] ?? citationsByItemID[Number(id)];
    if (!Array.isArray(citations) || citations.length === 0) {
      const prev = oldIdData[id]?.plainCitation || oldIdData[String(id)]?.plainCitation;
      return prev && prev.startsWith(`${order}: `) && !prev.endsWith("(error)") ? prev : `${order}: (error)`;
    }
    const labels = citations.map(entry => {
      const rawText = typeof entry?.properties?.plainCitation === "string"
        ? entry.properties.plainCitation.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim()
        : "";
      return rawText || "(no text)";
    });
    return `${order}: ` + labels.join(", ");
  }

  /**
   * Formats item plain citations and synchronizes session collection items.
   * @private
   */
  async _applyCitations(sessionID, citationsByItemID, sortedItemIDs, styleClass, revision) {
    if (!citationsByItemID || typeof citationsByItemID !== "object" || !Array.isArray(sortedItemIDs)) return;
    const citationIDKeySet = new Set(Object.keys(citationsByItemID));
    for (const id of sortedItemIDs) {
      if (Number.isSafeInteger(Number(id)) && Number(id) > 0) citationIDKeySet.add(String(id));
    }
    const citationIDKeys = [...citationIDKeySet];
    const isNoteStyle = styleClass === "note";
    const idIndexMap = new Map(sortedItemIDs.map((id, idx) => [Number(id), idx]));
    const oldIdData = this.sessions[sessionID]?.idData || {};

    const targetData = {};
    for (const id of citationIDKeys) {
      const zotItem = typeof Zotero !== "undefined" && typeof Zotero.Items?.get === "function" ? Zotero.Items.get(Number(id)) : null;
      if (zotItem && (zotItem.deleted === true || zotItem.inTrash === true)) continue;
      try {
        targetData[id] = { plainCitation: this._formatItemPlainCitation(id, idIndexMap, citationsByItemID, oldIdData, isNoteStyle) };
      } catch {
        targetData[id] = { plainCitation: "(error)" };
      }
    }

    if (!this.sessions[sessionID]) return;

    let hasChanges = Object.keys(targetData).length !== Object.keys(oldIdData).length;
    if (!hasChanges) {
      for (const id in targetData) {
        if (targetData[id].plainCitation !== oldIdData[id]?.plainCitation) {
          hasChanges = true;
          break;
        }
      }
    }

    const citationSession = this.sessions[sessionID];
    const userLibraryID = Zotero.Libraries.userLibraryID;
    const targetIDs = citationIDKeys.map(Number).filter(id => {
      if (!Number.isSafeInteger(id) || id <= 0) return false;
      const item = Zotero.Items.get(id);
      if (!item || item.libraryID !== userLibraryID || item.deleted === true || item.inTrash === true) return false;
      return typeof item.isTopLevelItem !== "function" || item.isTopLevelItem();
    });

    if (this._sessionUpdateRevision[sessionID] !== revision) return;
    await this.syncCollectionItems(citationSession, targetIDs);

    if (this._listenerStopped || citationSession.closing
      || this._sessionUpdateRevision[sessionID] !== revision || this.sessions?.[sessionID] !== citationSession) {
      return;
    }

    if (hasChanges) {
      citationSession.idData = targetData;
      this._invalidateSessionIndex();
      this.scheduleItemsViewRefresh();
    }
  }
}
