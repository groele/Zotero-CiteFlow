import {
  TEMP_COLLECTION_RELATION,
  TEMP_COLLECTION_MARKER,
  LEGACY_UPSTREAM_TEMP_COLLECTION_MARKER,
  TEMP_COLLECTION_KEYS_PREF,
  TEMP_SEARCH_KEYS_PREF
} from "./constants.ts";

// ============================================================================
// Temporary Collection Lifecycle, Renaming & Stale Cleanup
// ============================================================================

type Collection = Omit<Zotero.Collection, "libraryID"> & {libraryID:number;_isCiteFlowCollection?:boolean};
type Search = {key:string;eraseTx():Promise<void>};
const timers = globalThis as unknown as {setTimeout(callback:()=>void,ms:number):number;clearTimeout(id:number):void};
type Session = {collection?:Collection;closing?:boolean;docId?:string;lastName?:string;_renameTask?:Promise<void>|null};
type Context = CitationCollections & {sessions:Record<string,Session>;_listenerStopped:boolean;_temporaryCollectionKeys:Set<string>;_managedSearchKeys:Set<string>;_managedCitationTagIDs?:Record<string,boolean>;_docIdBySession:Record<string,string>;_collectionRenameRetryCountBySession:Record<string,number>;_collectionRenameRetryTimerBySession:Record<string,number>;_lastRefreshFingerprintBySession?:WeakMap<object,string>;_lastSyncFailedBySession?:WeakMap<object,boolean>;_getDocumentDisplayName(id:string):string;_getUniqueCollectionDisplayName?(id:string,doc:unknown):string;_getPendingCollectionName(id:string):string;_invalidateSessionIndex():void;_saveKeySet(key:string,values:Set<string>):void;syncCitationTags?(id:string,items:number[]):Promise<unknown>;logError(message:string,error:unknown):void;debugLog(...args:unknown[]):void};
declare const addon: {data?:{views?:{repositionCitationCollections?():void}}};

export class CitationCollections {
  /**
   * Purges orphan temporary collections, legacy searches, and stale managed tags from prior sessions.
   * @returns {Promise<void>}
   */
  async clearStaleArtifacts(this: Context) {
    const libraryID = Zotero.Libraries.userLibraryID;
    await this._clearStaleTemporaryCollections(libraryID);
    await this._clearStaleManagedSearches(libraryID);
    await this._clearStaleManagedTags();
  }

  /**
   * Clears persisted plugin-managed citation tags at startup when no Word integration sessions are active.
   * @returns {Promise<void>}
   * @private
   */
  async _clearStaleManagedTags(this: Context) {
    const activeSessions = Object.keys(this.sessions || {}).length > 0
      || Object.keys((Zotero.Integration as unknown as {sessions?:Record<string,unknown>})?.sessions || {}).length > 0;
    if (activeSessions || !Object.keys(this._managedCitationTagIDs || {}).length
      || typeof this.syncCitationTags !== "function") return;
    await this.syncCitationTags("__startup__", []);
  }

  /**
   * Purges tracked and relation-marked stale temporary citation collections.
   * @param {number} libraryID - Target user library ID
   * @returns {Promise<void>}
   * @private
   */
  async _clearStaleTemporaryCollections(this: Context, libraryID: number) {
    const collections = (Zotero.Collections.getByLibrary as unknown as (id:number, recursive:boolean, includeTrashed:boolean)=>Zotero.Collection[])(libraryID, true, true) || [];
    const collectionsByKey = new Map(collections.map(c => [c.key, c]));
    const activeKeys = new Set(
      Object.values(this.sessions || {}).filter(s => s && !s.closing && s.collection?.key).map(s => s.collection!.key)
    );
    const removedKeys = new Set<string>();
    const remainingKeys = new Set<string>();

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
  async _clearStaleManagedSearches(this: Context, libraryID: number) {
    if (!this._managedSearchKeys?.size) return;
    const searchesByKey = new Map(((Zotero.Searches as unknown as {getByLibrary(id:number):Search[]}).getByLibrary(libraryID) || []).map(s => [s.key, s]));
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
  async initCollection(this: Context, sessionID: string, session: Session = this.sessions[sessionID]) {
    if (!session || this._listenerStopped) return;
    if (Zotero.Prefs.get("extensions.zotero.zoterocitation.collections.enable", true) === false) return;
    const collection = new Zotero.Collection() as unknown as Collection;
    collection._isCiteFlowCollection = true;
    collection.libraryID = Zotero.Libraries.userLibraryID;
    const knownDocId = session.docId || this._docIdBySession?.[sessionID];
    const knownName = knownDocId
      ? (this._getUniqueCollectionDisplayName?.(sessionID, knownDocId) || this._getDocumentDisplayName(knownDocId))
      : "";
    collection.name = knownName || this._getPendingCollectionName(sessionID);
    session.lastName = collection.name;
    try {
      if (typeof collection.addRelation === "function") {
        collection.addRelation(TEMP_COLLECTION_RELATION, TEMP_COLLECTION_MARKER);
      }
    } catch (error) {
      this.logError("Failed to mark temporary Word citation collection", error);
    }
    if (collection.key) {
      this._temporaryCollectionKeys.add(collection.key);
    }
    await collection.saveTx({ skipSelect: true });
    this._temporaryCollectionKeys.add(collection.key);
    this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);
    if (this._listenerStopped || session.closing || this.sessions[sessionID] !== session
      || Zotero.Prefs?.get?.("extensions.zotero.zoterocitation.collections.enable", true) === false) {
      await collection.eraseTx();
      this._temporaryCollectionKeys.delete(collection.key);
      this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);
      return;
    }
    session.collection = collection;
    this._lastRefreshFingerprintBySession?.delete(session);
    this._lastSyncFailedBySession?.delete(session);
    this._invalidateSessionIndex();
    addon?.data?.views?.repositionCitationCollections?.();
  }

  /**
   * Transactionally synchronizes item members in the session's temporary collection.
   * @param {object} session - Session object
   * @param {number[]} targetIDs - Target item IDs
   * @returns {Promise<boolean>}
   */
  async syncCollectionItems(this: Context, session: Session, targetIDs: number[]): Promise<boolean> {
    const collection = session?.collection;
    if (this._listenerStopped || session?.closing || !collection?.id) return true;
    if (Zotero.Prefs.get("extensions.zotero.zoterocitation.collections.enable", true) === false) return true;

    const normalizedTargetIDs = [...new Set(targetIDs.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
    const currentIDs = (collection.getChildItems(true) as Array<number | {id:number}>)
      .map(itemOrID => typeof itemOrID === "number" ? itemOrID : itemOrID?.id)
      .filter(id => Number.isSafeInteger(id) && id > 0);

    const targetSet = new Set(normalizedTargetIDs);
    const currentSet = new Set(currentIDs);
    const remove = currentIDs.filter(id => !targetSet.has(id));
    const add = normalizedTargetIDs.filter(id => !currentSet.has(id));

    if (!remove.length && !add.length) return true;

    try {
      await Zotero.DB.executeTransaction(async () => {
        if (this._listenerStopped || session.closing) return;
        if (remove.length) await collection.removeItems(remove);
        if (add.length) await collection.addItems(add);
      });
      return true;
    } catch (error) {
      this.logError("Failed to synchronize Word citation collection items", error);
      return false;
    }
  }

  /**
   * Associates a session with a document ID and clears obsolete rename timers.
   * @param {string} sessionID - Session identifier
   * @param {string} docId - Document path or URI
   * @private
   */
  _rememberSessionDocument(this: Context, sessionID: string, docId: string) {
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
  _clearCollectionRenameRetry(this: Context, sessionID: string) {
    const timer = this._collectionRenameRetryTimerBySession?.[sessionID];
    if (timer) {
      timers.clearTimeout(timer);
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
  _scheduleCollectionRenameRetry(this: Context, sessionID: string, targetName: string, docId = this._docIdBySession?.[sessionID]) {
    if (this._listenerStopped || !sessionID || !targetName || this._collectionRenameRetryTimerBySession?.[sessionID]) return;
    const attempt = (this._collectionRenameRetryCountBySession[sessionID] || 0) + 1;
    if (attempt > 4) {
      this.debugLog("[Citation execCommand] collection rename retries exhausted", sessionID);
      return;
    }
    this._collectionRenameRetryCountBySession[sessionID] = attempt;
    this._collectionRenameRetryTimerBySession[sessionID] = timers.setTimeout(() => {
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
  async _renameCollection(this: Context, sessionID: string, targetName: string, docId?: string) {
    const session = this.sessions?.[sessionID];
    if (!session) return;
    const task = (session._renameTask || Promise.resolve()).catch(() => {}).then(async () => {
      if (this._listenerStopped || session.closing || this.sessions?.[sessionID] !== session
        || (docId && this._docIdBySession[sessionID] !== docId) || !session.collection) return;
      const previousName = session.collection.name;
      if (previousName === targetName) {
        this._clearCollectionRenameRetry(sessionID);
        return;
      }
      session.collection.name = targetName;
      try {
        await session.collection.saveTx({ skipSelect: true });
        this._clearCollectionRenameRetry(sessionID);
        session.lastName = targetName;
        addon?.data?.views?.repositionCitationCollections?.();
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
