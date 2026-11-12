import { markTagSyncOutcome, tryCommitSessionFingerprint, type SyncCompletionContext } from "./sync-state-helpers.ts";

// ============================================================================
// Tag Governance & Read-Only Protection
// ============================================================================

type TaggedItem = {libraryID:number;editable?:boolean;deleted?:boolean;inTrash?:boolean;isEditable?():boolean;hasTag?(name:string):boolean;getTags?():Array<string|{tag:string}>;addTag(name:string):void;removeTag(name:string):void;saveTx():Promise<unknown>};
type SyncResult = {complete:boolean;touchedCount:number} | undefined;
type TagContext = CitationTagGovernance & SyncCompletionContext & {_listenerStopped:boolean;_sessionCitedIDs:Record<string,number[]>;_lastTagSyncSig:Record<string,string>;_pendingTagSyncIDsBySession:Record<string,number[] | undefined>;_tagSyncTimerBySession:Record<string,number>;_tagSyncInFlightBySession:Record<string,Promise<SyncResult> | undefined>;_tagSyncDebounceMs:number;_managedCitationTagIDs:Record<string,boolean>;_managedCitationTagNames:Record<string,string>;_citationTagName:string;_tagSyncQueue:Promise<SyncResult>|null;_tagOwnershipDirty:boolean;sessions:Record<string,{closing?:boolean}>;_bumpDebugCounter(name:string,delta?:number):void;_recordPerf(name:string,ms:number):void;_saveManagedTagIDs():boolean;logError(message:string,error:unknown):void};
declare const runtime:{log(...args:unknown[]):void};
const timers = globalThis as unknown as {setTimeout(callback:()=>void,ms:number):number};

export class CitationTagGovernance {
  /**
   * Constructs a deterministic signature from an array of item IDs.
   * @param {number[]} sortedItemIDs - Array of item IDs
   * @returns {string} Comma-separated signature
   * @private
   */
  _buildCitationTagSig(this: TagContext, sortedItemIDs: number[]) {
    if (!Array.isArray(sortedItemIDs) || sortedItemIDs.length === 0) return "";
    const uniq = Array.from(new Set(
      sortedItemIDs.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)
    )).sort((a, b) => a - b);
    return uniq.join(",");
  }

  /**
   * Schedules a debounced tag synchronization for a given session.
   * @param {string} sessionID - Session identifier
   * @param {number[]} sortedItemIDs - Cited item IDs
   * @param {boolean} [force=false] - Force sync even if signature matches
   */
  scheduleCitationTagSync(this: TagContext, sessionID: string, sortedItemIDs: number[], force = false) {
    if (this._listenerStopped) return;
    const normalizedIDs = Array.isArray(sortedItemIDs)
      ? sortedItemIDs.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)
      : [];
    const sig = this._buildCitationTagSig(normalizedIDs);
    if (normalizedIDs.length) this._sessionCitedIDs[sessionID] = normalizedIDs;
    else delete this._sessionCitedIDs[sessionID];

    if (this._listenerStopped) return;
    if (!force && this._lastTagSyncSig[sessionID] === sig) return;

    this._lastTagSyncSig[sessionID] = sig;
    this._pendingTagSyncIDsBySession[sessionID] = normalizedIDs;
    if (this._tagSyncTimerBySession[sessionID]) return;

    this._tagSyncTimerBySession[sessionID] = timers.setTimeout(() => {
      delete this._tagSyncTimerBySession[sessionID];
      const pendingIDs = this._pendingTagSyncIDsBySession[sessionID];
      if (!pendingIDs || this._tagSyncInFlightBySession[sessionID]) return;
      delete this._pendingTagSyncIDsBySession[sessionID];

      const syncPromise = this.syncCitationTags(sessionID, pendingIDs);
      this._tagSyncInFlightBySession[sessionID] = syncPromise;
      void syncPromise.catch(e => {
        runtime?.log?.("[Citation scheduleCitationTagSync] Unexpected error:", e);
      }).finally(() => {
        if (this._tagSyncInFlightBySession[sessionID] === syncPromise) {
          delete this._tagSyncInFlightBySession[sessionID];
        }
        const nextPendingIDs = this._pendingTagSyncIDsBySession[sessionID];
        if (nextPendingIDs) {
          delete this._pendingTagSyncIDsBySession[sessionID];
          this.scheduleCitationTagSync(sessionID, nextPendingIDs, true);
        } else {
          tryCommitSessionFingerprint(this, sessionID);
        }
      });
    }, this._tagSyncDebounceMs);
  }

  /**
   * Validates whether an item belongs to the user library and is writable (Read-Only Guard).
   * @param {Zotero.Item} item - Zotero item
   * @returns {boolean} True if safe to write
   * @private
   */
  _isWritableCitationItem(this: TagContext, item: TaggedItem) {
    const userLibraryID = Zotero.Libraries?.userLibraryID;
    if (!item || item.libraryID !== userLibraryID || item.editable === false
      || item.deleted === true || item.inTrash === true) {
      return false;
    }
    try {
      if (typeof item.isEditable === "function" && !item.isEditable()) return false;
      const library = (typeof Zotero.Libraries?.get === "function" ? Zotero.Libraries.get(item.libraryID) : null) as {editable?:boolean | (()=>boolean);readOnly?:boolean;isEditable?():boolean} | null;
      if (library?.editable === false || library?.readOnly === true) return false;
      if (typeof library?.isEditable === "function" && !library.isEditable()) return false;
      if (typeof library?.editable === "function" && !library.editable()) return false;
    } catch {
      return false;
    }
    return true;
  }

  /**
   * Checks whether an item currently carries the specified tag name.
   * @param {Zotero.Item} item - Zotero item
   * @param {string} tagName - Tag string to check
   * @returns {boolean}
   * @private
   */
  _hasItemTag(this: TagContext, item: TaggedItem, tagName: string) {
    return typeof item.hasTag === "function"
      ? item.hasTag(tagName)
      : (item.getTags?.() || []).some(tag => (typeof tag === "string" ? tag : tag?.tag) === tagName);
  }

  /**
   * Resolves a Zotero item synchronously or asynchronously by ID.
   * @param {number} itemID - Zotero item ID
   * @returns {Promise<Zotero.Item|null>}
   * @private
   */
  async _resolveItemByID(this: TagContext, itemID: number) {
    let item = Zotero.Items.get(itemID);
    if (!item && typeof Zotero.Items.getAsync === "function") {
      item = await Zotero.Items.getAsync(itemID);
    }
    return (item || null) as unknown as TaggedItem | null;
  }

  /**
   * Collects the union of cited item IDs across all active Word sessions when tags are enabled.
   * @returns {Set<number>}
   * @private
   */
  _collectActiveCitedIDSet(this: TagContext) {
    const activeCitedIDSet = new Set<number>();
    if (Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.enable", true) !== false) {
      const liveSessions = Zotero.Integration?.sessions;
      for (const sid in this._sessionCitedIDs) {
        if (this.sessions?.[sid]?.closing) continue;
        if (liveSessions && typeof liveSessions === "object" && Object.keys(liveSessions).length > 0 && !(sid in liveSessions) && !(sid in (this.sessions || {}))) {
          continue;
        }
        const ids = this._sessionCitedIDs[sid] || [];
        ids.forEach(id => activeCitedIDSet.add(Number(id)));
      }
    }
    return activeCitedIDSet;
  }

  /**
   * Adds or renames the managed citation tag on a single actively cited item with rollback safety.
   * @param {Zotero.Item} item - Target Zotero item
   * @param {number} itemID - Item ID
   * @param {string} tagName - Target citation tag name
   * @returns {Promise<{ touched: boolean, skipped: boolean, ownershipChanged: boolean }>}
   * @private
   */
  async _syncActiveItemCitationTag(this: TagContext, item: TaggedItem, itemID: number, tagName: string) {
    let touched = false;
    let ownershipChanged = false;
    const oldName = this._managedCitationTagIDs[itemID] && (this._managedCitationTagNames[itemID] || "/Citations");
    const removeOld = oldName && oldName !== tagName && this._hasItemTag(item, oldName);
    const addNew = !this._hasItemTag(item, tagName);

    if ((removeOld && typeof item.removeTag !== "function") || (addNew && typeof item.addTag !== "function")) {
      return { touched: false, skipped: true, ownershipChanged: false };
    }

    if (removeOld || addNew) {
      if (removeOld) item.removeTag(oldName);
      if (addNew) item.addTag(tagName);
      try {
        await item.saveTx();
        touched = true;
        ownershipChanged = true;
      } catch (saveError) {
        try {
          if (addNew) item.removeTag(tagName);
          if (removeOld) item.addTag(oldName);
        } catch (rollbackError) {
          this.logError(`Failed to roll back citation tag change for item ${itemID}`, rollbackError);
        }
        throw saveError;
      }
    }

    if (oldName && oldName !== tagName) {
      delete this._managedCitationTagIDs[itemID];
      delete this._managedCitationTagNames[itemID];
      ownershipChanged = true;
    }
    if (addNew || (oldName === tagName && this._managedCitationTagIDs[itemID])) {
      this._managedCitationTagIDs[itemID] = true;
      this._managedCitationTagNames[itemID] = tagName;
    }
    return { touched, skipped: false, ownershipChanged };
  }

  /**
   * Removes the plugin-managed citation tag from a single item that is no longer cited.
   * @param {Zotero.Item} item - Target Zotero item
   * @param {number} itemID - Item ID
   * @returns {Promise<{ touched: boolean, ownershipChanged: boolean }>}
   * @private
   */
  async _removeUncitedManagedItemTag(this: TagContext, item: TaggedItem, itemID: number) {
    let touched = false;
    const managedName = this._managedCitationTagNames[itemID] || "/Citations";
    const hasCitationTag = this._hasItemTag(item, managedName);

    if (hasCitationTag && typeof item.removeTag === "function") {
      item.removeTag(managedName);
      try {
        await item.saveTx();
        touched = true;
      } catch (saveError) {
        try {
          if (typeof item.addTag === "function") item.addTag(managedName);
        } catch (rollbackError) {
          runtime?.log?.("[Citation syncCitationTags] Failed to roll back tag removal", itemID, rollbackError);
        }
        throw saveError;
      }
    }
    delete this._managedCitationTagIDs[itemID];
    delete this._managedCitationTagNames[itemID];
    return { touched, ownershipChanged: true };
  }

  /**
   * Serializes tag synchronization through a single sequential promise queue.
   * @param {string} sessionID - Session identifier
   * @param {number[]} sortedItemIDs - Cited item IDs
   * @returns {Promise<{ complete: boolean, touchedCount: number }>}
   */
  async syncCitationTags(this: TagContext, sessionID: string, sortedItemIDs: number[]) {
    if (this._listenerStopped && sessionID !== "__shutdown__") return;
    const previous = this._tagSyncQueue || Promise.resolve();
    const task = previous.catch(() => {}).then(() => this._syncCitationTags(sessionID, sortedItemIDs));
    this._tagSyncQueue = task;
    try {
      return await task;
    } finally {
      if (this._tagSyncQueue === task) this._tagSyncQueue = null;
    }
  }

  /**
   * Synchronizes managed citation tags on user items with transactional rollback on save failures.
   * @param {string} sessionID - Session identifier
   * @param {number[]} _sortedItemIDs - Cited item IDs
   * @returns {Promise<{ complete: boolean, touchedCount: number }>}
   * @private
   */
  async _syncCitationTags(this: TagContext, sessionID: string, _sortedItemIDs: number[]) {
    if (this._listenerStopped && sessionID !== "__shutdown__") return;
    const tagName = this._citationTagName;
    this._managedCitationTagNames ??= {};
    this._managedCitationTagIDs ??= {};
    const perfStart = Date.now();
    let touchedCount = 0;
    let lastYieldedTouchCount = 0;
    let hadFailures = false;
    let skipped = false;
    let ownershipChanged = false;
    this._bumpDebugCounter("syncCitationTagsRuns");

    try {
      const activeCitedIDSet = this._collectActiveCitedIDSet();

      for (const itemID of activeCitedIDSet) {
        if (!Number.isInteger(itemID) || itemID <= 0) continue;
        try {
          const item = await this._resolveItemByID(itemID);
          if (!item) continue;
          if (!this._isWritableCitationItem(item)) {
            const isTrashed = item.deleted === true || item.inTrash === true;
            if (!isTrashed && (item.libraryID === Zotero.Libraries?.userLibraryID || this._managedCitationTagIDs[itemID])) skipped = true;
            continue;
          }
          if (Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.enable", true) === false || this._citationTagName !== tagName) break;

          const res = await this._syncActiveItemCitationTag(item, itemID, tagName);
          if (res.skipped) {
            skipped = true;
            continue;
          }
          if (res.touched) touchedCount += 1;
          if (res.ownershipChanged) ownershipChanged = true;

          if (touchedCount > 0 && touchedCount % 30 === 0 && touchedCount !== lastYieldedTouchCount) {
            lastYieldedTouchCount = touchedCount;
            await Zotero.Promise.delay(0);
          }
        } catch (e) {
          hadFailures = true;
          this._bumpDebugCounter("syncCitationTagsFailures");
          this.logError(`Failed to add or rename citation tag for item ${itemID}`, e);
        }
      }

      const managedIDs = Object.keys(this._managedCitationTagIDs).map(id => Number(id));
      for (const itemID of managedIDs) {
        if (activeCitedIDSet.has(itemID)) continue;
        try {
          const item = await this._resolveItemByID(itemID);
          if (!item) {
            delete this._managedCitationTagIDs[itemID];
            delete this._managedCitationTagNames[itemID];
            ownershipChanged = true;
            continue;
          }
          if (!this._isWritableCitationItem(item)) {
            if (item.deleted !== true && item.inTrash !== true) skipped = true;
            continue;
          }

          const res = await this._removeUncitedManagedItemTag(item, itemID);
          if (res.touched) touchedCount += 1;
          if (res.ownershipChanged) ownershipChanged = true;

          if (touchedCount > 0 && touchedCount % 30 === 0 && touchedCount !== lastYieldedTouchCount) {
            lastYieldedTouchCount = touchedCount;
            await Zotero.Promise.delay(0);
          }
        } catch (e) {
          hadFailures = true;
          this._bumpDebugCounter("syncCitationTagsFailures");
          this.logError(`Failed to remove citation tag for item ${itemID}`, e);
        }
      }
    } finally {
      if (ownershipChanged || hadFailures || this._tagOwnershipDirty) {
        this._tagOwnershipDirty = this._saveManagedTagIDs() === false;
        if (this._tagOwnershipDirty) hadFailures = true;
      }
      if (touchedCount > 0) this._bumpDebugCounter("syncCitationTagsTouched", touchedCount);
      if (hadFailures) delete this._lastTagSyncSig[sessionID];
      markTagSyncOutcome(this, sessionID, !hadFailures);
      this._recordPerf("syncCitationTags", Date.now() - perfStart);
    }
    return { complete: !hadFailures && !skipped, touchedCount };
  }
}
