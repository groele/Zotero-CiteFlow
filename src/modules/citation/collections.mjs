import {
  TEMP_COLLECTION_RELATION,
  TEMP_COLLECTION_MARKER,
  LEGACY_UPSTREAM_TEMP_COLLECTION_MARKER,
  TEMP_COLLECTION_KEYS_PREF,
  TEMP_SEARCH_KEYS_PREF
} from "./constants.mjs";

// ============================================================================
// Temporary Collection Lifecycle, Renaming & Stale Cleanup
// ============================================================================

export class CitationCollections {
  /**
   * Purges orphan temporary collections and legacy searches without modifying user collections.
   * @returns {Promise<void>}
   */
  async clearStaleArtifacts() {
    const libraryID = Zotero.Libraries.userLibraryID;
    await this._clearStaleTemporaryCollections(libraryID);
    await this._clearStaleManagedSearches(libraryID);
  }

  /**
   * Purges tracked and relation-marked stale temporary citation collections.
   * @param {number} libraryID - Target user library ID
   * @returns {Promise<void>}
   * @private
   */
  async _clearStaleTemporaryCollections(libraryID) {
    const collections = Zotero.Collections.getByLibrary(libraryID, true, true);
    const collectionsByKey = new Map(collections.map(c => [c.key, c]));
    const activeKeys = new Set(
      Object.values(this.sessions || {}).filter(s => s && !s.closing && s.collection?.key).map(s => s.collection.key)
    );
    const removedKeys = new Set();
    const remainingKeys = new Set();

    for (const key of this._temporaryCollectionKeys || []) {
      if (activeKeys.has(key)) {
        remainingKeys.add(key);
        continue;
      }
      const collection = collectionsByKey.get(key);
      if (!collection) continue;
      try {
        await collection.eraseTx();
        removedKeys.add(key);
      } catch (error) {
        remainingKeys.add(key);
        this.logError("Failed to remove a stale citation collection", error);
      }
    }

    for (const collection of collections) {
      if (removedKeys.has(collection.key) || activeKeys.has(collection.key)) continue;
      try {
        await collection.loadDataType("relations");
        const relations = collection.getRelationsByPredicate(TEMP_COLLECTION_RELATION) || [];
        if (relations.includes(TEMP_COLLECTION_MARKER) || relations.includes(LEGACY_UPSTREAM_TEMP_COLLECTION_MARKER)) {
          await collection.eraseTx();
        }
      } catch (error) {
        this.logError("Failed to remove a stale citation collection", error);
      }
    }

    this._temporaryCollectionKeys = remainingKeys;
    this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);
  }

  /**
   * Purges legacy plugin-managed saved searches from the user library.
   * @param {number} libraryID - Target user library ID
   * @returns {Promise<void>}
   * @private
   */
  async _clearStaleManagedSearches(libraryID) {
    if (!this._managedSearchKeys?.size) return;
    const searchesByKey = new Map(Zotero.Searches.getByLibrary(libraryID).map(s => [s.key, s]));
    for (const key of [...this._managedSearchKeys]) {
      const search = searchesByKey.get(key);
      if (!search) {
        this._managedSearchKeys.delete(key);
        continue;
      }
      try {
        await search.eraseTx();
        this._managedSearchKeys.delete(key);
      } catch (error) {
        this.logError("Failed to remove a legacy citation search", error);
      }
    }
    this._saveKeySet(TEMP_SEARCH_KEYS_PREF, this._managedSearchKeys);
  }

  /**
   * Initializes a temporary Word citation collection in the user library.
   * @param {string} sessionID - Session identifier
   * @param {object} [session] - Internal session object
   * @returns {Promise<void>}
   */
  async initCollection(sessionID, session = this.sessions[sessionID]) {
    if (!session || this._listenerStopped) return;
    const collection = new Zotero.Collection();
    collection.libraryID = Zotero.Libraries.userLibraryID;
    collection.name = this._getPendingCollectionName(sessionID);
    try {
      if (typeof collection.addRelation === "function") {
        collection.addRelation(TEMP_COLLECTION_RELATION, TEMP_COLLECTION_MARKER);
      }
    } catch (error) {
      this.logError("Failed to mark temporary Word citation collection", error);
    }
    await collection.saveTx({ skipSelect: true });
    this._temporaryCollectionKeys.add(collection.key);
    this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);
    if (this._listenerStopped || this.sessions[sessionID] !== session) {
      await collection.eraseTx();
      this._temporaryCollectionKeys.delete(collection.key);
      this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);
      return;
    }
    session.collection = collection;
    this._invalidateSessionIndex();
  }

  /**
   * Transactionally synchronizes item members in the session's temporary collection.
   * @param {object} session - Session object
   * @param {number[]} targetIDs - Target item IDs
   * @returns {Promise<void>}
   */
  async syncCollectionItems(session, targetIDs) {
    const collection = session?.collection;
    if (this._listenerStopped || session?.closing || !collection?.id) return;

    const normalizedTargetIDs = [...new Set(targetIDs.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
    const currentIDs = collection.getChildItems(true)
      .map(itemOrID => typeof itemOrID === "number" ? itemOrID : itemOrID?.id)
      .filter(id => Number.isSafeInteger(id) && id > 0);

    const targetSet = new Set(normalizedTargetIDs);
    const currentSet = new Set(currentIDs);
    const remove = currentIDs.filter(id => !targetSet.has(id));
    const add = normalizedTargetIDs.filter(id => !currentSet.has(id));

    if (!remove.length && !add.length) return;

    await Zotero.DB.executeTransaction(async () => {
      if (this._listenerStopped || session.closing) return;
      if (remove.length) await collection.removeItems(remove);
      if (add.length) await collection.addItems(add);
    });
  }

  /**
   * Associates a session with a document ID and clears obsolete rename timers.
   * @param {string} sessionID - Session identifier
   * @param {string} docId - Document path or URI
   * @private
   */
  _rememberSessionDocument(sessionID, docId) {
    if (typeof sessionID !== "string" || !sessionID || !docId) return;
    if (this._docIdBySession[sessionID] && this._docIdBySession[sessionID] !== docId) {
      this._clearCollectionRenameRetry(sessionID);
    }
    this._docIdBySession[sessionID] = docId;
    const session = this.sessions?.[sessionID];
    if (session) session.docId = docId;
  }

  /**
   * Clears collection rename retry timers and counters for a session.
   * @param {string} sessionID - Session identifier
   * @private
   */
  _clearCollectionRenameRetry(sessionID) {
    const timer = this._collectionRenameRetryTimerBySession?.[sessionID];
    if (timer) {
      globalThis.clearTimeout(timer);
      delete this._collectionRenameRetryTimerBySession[sessionID];
    }
    if (this._collectionRenameRetryCountBySession) {
      delete this._collectionRenameRetryCountBySession[sessionID];
    }
  }

  /**
   * Schedules an exponential retry for collection renaming.
   * @param {string} sessionID - Session identifier
   * @param {string} targetName - Target collection name
   * @param {string} [docId] - Expected document identifier
   * @private
   */
  _scheduleCollectionRenameRetry(sessionID, targetName, docId = this._docIdBySession?.[sessionID]) {
    if (this._listenerStopped || !sessionID || !targetName || this._collectionRenameRetryTimerBySession?.[sessionID]) return;
    const attempt = (this._collectionRenameRetryCountBySession[sessionID] || 0) + 1;
    if (attempt > 2) {
      this.debugLog("[Citation execCommand] collection rename retries exhausted", sessionID);
      return;
    }
    this._collectionRenameRetryCountBySession[sessionID] = attempt;
    this._collectionRenameRetryTimerBySession[sessionID] = globalThis.setTimeout(() => {
      delete this._collectionRenameRetryTimerBySession[sessionID];
      const session = this.sessions?.[sessionID];
      if (this._listenerStopped || !session?.collection || (docId && this._docIdBySession?.[sessionID] !== docId)) return;
      this._renameCollection(sessionID, targetName, docId).catch(error => {
        this.logError(`Failed to retry Word citation collection rename for ${sessionID}`, error);
        this._scheduleCollectionRenameRetry(sessionID, targetName, docId);
      });
    }, 100 * attempt);
  }

  /**
   * Renames a temporary collection with serialized queuing and rollback on failure.
   * @param {string} sessionID - Session identifier
   * @param {string} targetName - New collection name
   * @param {string} [docId] - Expected document ID
   * @returns {Promise<void>}
   * @private
   */
  async _renameCollection(sessionID, targetName, docId) {
    const session = this.sessions?.[sessionID];
    if (!session) return;
    const task = (session._renameTask || Promise.resolve()).catch(() => {}).then(async () => {
      if (this._listenerStopped || session.closing || this.sessions?.[sessionID] !== session
        || (docId && this._docIdBySession[sessionID] !== docId) || !session.collection) return;
      const previousName = session.collection.name;
      if (previousName === targetName) return;
      session.collection.name = targetName;
      try {
        await session.collection.saveTx({ skipSelect: true });
        session.lastName = targetName;
      } catch (error) {
        session.collection.name = previousName;
        throw error;
      }
    });
    session._renameTask = task;
    try {
      await task;
    } finally {
      if (session._renameTask === task) session._renameTask = null;
    }
  }
}
