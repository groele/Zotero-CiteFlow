import { MANAGED_TAG_IDS_PREF, MANAGED_TAG_STATE_PREF, TEMP_COLLECTION_KEYS_PREF } from "./constants.ts";

// ============================================================================
// Configuration & State Serialization
// ============================================================================

type Collection = {key?:string;libraryID?:number;eraseTx():Promise<void>};
type Session = {collection?:Collection;closing?:boolean;idData?:Record<string,unknown>};
type PrefContext = CitationPreferences & {_collectionsEnabled:boolean;_citationTagsEnabled:boolean;_citationTagName:string;_debugEnabled:boolean;_tagSyncDebounceMs:number;_itemsViewRefreshDebounceMs:number;_healthWindowMs:number;_perfSlowThresholdMs:number;sessions:Record<string,Session>;_temporaryCollectionKeys:Set<string>;_tagPreferencesNeedSync:boolean;_lastTagSyncSig:Record<string,string>;_managedCitationTagIDs:Record<string,boolean>;_managedCitationTagNames:Record<string,string>;_invalidateSessionIndex():void;clearStaleArtifacts():Promise<void>;initCollection(id:string,s:Session):Promise<void>;refreshSessionCitations(id:string,s:unknown):Promise<void>;syncCollectionItems(s:Session,ids:number[]):Promise<void>;syncCitationTags(id:string,ids:number[]):Promise<{complete?:boolean}>;logError(message:string,error:unknown):void};
declare const addon: {data?:{citationDebugEnabled?:boolean}};

export class CitationPreferences {
  /**
   * Reads a boolean preference from Zotero.Prefs safely.
   * @param {string} key - Preference key
   * @param {boolean} fallback - Default fallback value
   * @returns {boolean}
   * @private
   */
  _getBoolPref(this: PrefContext, key: string, fallback: boolean) {
    try {
      const value = Zotero.Prefs.get(key, true);
      return typeof value === "boolean" ? value : fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Reads an integer preference clamped between min and max bounds.
   * @param {string} key - Preference key
   * @param {number} fallback - Default fallback value
   * @param {number} min - Minimum allowed value
   * @param {number} max - Maximum allowed value
   * @returns {number}
   * @private
   */
  _getClampedIntPref(this: PrefContext, key: string, fallback: number, min: number, max: number) {
    try {
      const raw = Zotero.Prefs.get(key, true);
      if ((typeof raw !== "number" && typeof raw !== "string") || (typeof raw === "string" && !raw.trim())) return fallback;
      const value = Number(raw);
      if (!Number.isFinite(value)) return fallback;
      return Math.max(min, Math.min(max, Math.trunc(value)));
    } catch {
      return fallback;
    }
  }

  /**
   * Validates and returns the configured citation tag name string.
   * @returns {string} Tag name (defaults to "/Citations")
   * @private
   */
  _getCitationTagName(this: PrefContext) {
    const name = Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.text", true);
    return typeof name === "string" && name.trim() && name.trim().length <= 200 && !/[\x00-\x1f\x7f]/.test(name)
      ? name.trim() : "/Citations";
  }

  /**
   * Applies updated preferences and triggers dynamic tag synchronization if tag settings changed.
   * @returns {Promise<object>|undefined}
   */
  applyPreferences(this: PrefContext) {
    const collectionsEnabled = Zotero.Prefs.get("extensions.zotero.zoterocitation.collections.enable", true) !== false;
    const collectionsChanged = this._collectionsEnabled !== undefined && this._collectionsEnabled !== collectionsEnabled;
    this._collectionsEnabled = collectionsEnabled;

    const tagsEnabled = Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.enable", true) !== false;
    const tagsChanged = this._citationTagsEnabled !== undefined && this._citationTagsEnabled !== tagsEnabled;
    const tagName = this._getCitationTagName();
    const tagRenamed = this._citationTagName !== undefined && this._citationTagName !== tagName;

    this._citationTagsEnabled = tagsEnabled;
    this._citationTagName = tagName;
    this._debugEnabled = this._getBoolPref("extensions.zotero.zoterocitation.debug", false);
    if ((globalThis as unknown as {addon?:typeof addon}).addon?.data) addon.data!.citationDebugEnabled = this._debugEnabled;

    this._tagSyncDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.citationTagDebounceMs", 150, 0, 2000);
    this._itemsViewRefreshDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.itemsViewRefreshDebounceMs", 120, 0, 2000);
    this._healthWindowMs = this._getClampedIntPref("extensions.zotero.zoterocitation.healthWindowMs", 300000, 10000, 3600000);
    this._perfSlowThresholdMs = this._getClampedIntPref("extensions.zotero.zoterocitation.perfSlowThresholdMs", 50, 5, 5000);

    let collectionTask = Promise.resolve();
    if (collectionsChanged && !collectionsEnabled) {
      const collectionsToErase = [];
      for (const session of Object.values(this.sessions || {})) {
        if (session.collection) {
          collectionsToErase.push(session.collection);
          delete session.collection;
        }
      }
      this._invalidateSessionIndex?.();
      collectionTask = (async () => {
        for (const col of collectionsToErase) {
          try {
            await col.eraseTx();
            if (col.key) {
              this._temporaryCollectionKeys?.delete(col.key);
            }
          } catch (e) {
            this.logError("Failed to erase temporary collection on disable", e);
          }
        }
        if (this._temporaryCollectionKeys) {
          this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);
        }
        await this.clearStaleArtifacts().catch(e => this.logError("Failed to clear collections on disable", e));
      })();
    } else if (collectionsChanged && collectionsEnabled) {
      collectionTask = (async () => {
        for (const [id, session] of Object.entries(this.sessions || {})) {
          if (!session.collection && !session.closing) {
            await this.initCollection(id, session).catch(() => {});
            if (!Object.keys(session.idData || {}).length && Zotero.Integration?.sessions?.[id]) {
              await this.refreshSessionCitations?.(id, Zotero.Integration.sessions[id]).catch(() => {});
            }
            const updatedCollection = (session as Session).collection;
            if (updatedCollection && session.idData) {
              const libID = updatedCollection.libraryID ?? Zotero.Libraries?.userLibraryID;
              const citedIDs = Object.keys(session.idData).map(Number).filter(itemID => {
                if (!Number.isSafeInteger(itemID) || itemID <= 0) return false;
                const item = Zotero.Items?.get?.(itemID);
                if (!item) return true;
                return item.libraryID === libID && item.deleted !== true && (item as typeof item & {inTrash?:boolean}).inTrash !== true
                  && (typeof item.isTopLevelItem !== "function" || item.isTopLevelItem());
              });
              if (citedIDs.length) await this.syncCollectionItems?.(session, citedIDs).catch(() => {});
            }
          }
        }
      })();
    }

    if (tagsChanged || tagRenamed || this._tagPreferencesNeedSync) {
      this._lastTagSyncSig = {};
      this._tagPreferencesNeedSync = true;
      return collectionTask.then(() => this.syncCitationTags("__preferences__", [])).then(result => {
        this._tagPreferencesNeedSync = result?.complete === false;
        return result;
      });
    }
    return collectionTask;
  }

  /**
   * Loads a JSON set of string keys from a preference.
   * @param {string} prefKey - Preference key
   * @returns {Set<string>}
   * @private
   */
  _loadKeySet(this: PrefContext, prefKey: string): Set<string> {
    try {
      let raw = Zotero.Prefs.get(prefKey);
      if (!raw) {
        const legacyRaw = Zotero.Prefs.get(prefKey, true);
        if (legacyRaw) {
          raw = legacyRaw;
          Zotero.Prefs.set(prefKey, legacyRaw);
        }
      }
      const values = raw ? JSON.parse(raw as string) : [];
      return new Set(Array.isArray(values) ? values.filter((v: unknown): v is string => typeof v === "string" && !!v) : []);
    } catch {
      return new Set();
    }
  }

  /**
   * Saves a Set of string keys to a preference as a JSON array.
   * @param {string} prefKey - Preference key
   * @param {Set<string>} values - Values to persist
   * @private
   */
  _saveKeySet(this: PrefContext, prefKey: string, values: Set<string>) {
    try {
      Zotero.Prefs.set(prefKey, JSON.stringify([...values]));
    } catch (error) {
      this.logError(`Failed to save preference ${prefKey}`, error);
    }
  }

  /**
   * Loads managed citation tag state with version-1 format and legacy array migration.
   * @returns {{ ids: object, names: object }}
   * @private
   */
  _loadManagedTagState(this: PrefContext) {
    let raw;
    try {
      raw = Zotero.Prefs.get(MANAGED_TAG_STATE_PREF);
      const state = raw && JSON.parse(raw as string);
      if (state?.version === 1 && state.tags && typeof state.tags === "object" && !Array.isArray(state.tags)) {
        const entries = Object.entries(state.tags).filter(([id, name]) =>
          Number.isSafeInteger(Number(id)) && Number(id) > 0
          && typeof name === "string" && name.trim() && name.length <= 200 && !/[\x00-\x1f\x7f]/.test(name));
        return {
          ids: Object.fromEntries(entries.map(([id]) => [id, true])),
          names: Object.fromEntries(entries) as Record<string, string>
        };
      }
      if (raw) throw new Error("Unsupported managed citation tag state");
    } catch (error) {
      this.logError("Failed to read managed citation tag state", error);
    }

    if (raw) return { ids: {}, names: {} };
    return this._loadLegacyManagedTagState();
  }

  /**
   * Migrates legacy array-based managed citation tag IDs from preferences.
   * @returns {{ ids: object, names: object }}
   * @private
   */
  _loadLegacyManagedTagState(this: PrefContext) {
    try {
      let rawKeys = Zotero.Prefs.get(MANAGED_TAG_IDS_PREF);
      if (!rawKeys) {
        const legacyRaw = Zotero.Prefs.get(MANAGED_TAG_IDS_PREF, true);
        if (legacyRaw) rawKeys = legacyRaw;
      }
      const keys = rawKeys ? JSON.parse(rawKeys as string) : [];
      const validKeys = Array.isArray(keys)
        ? keys.filter((k: unknown) => (typeof k === "string" || typeof k === "number") && Number.isSafeInteger(Number(k)) && Number(k) > 0).map(String)
        : [];
      return {
        ids: Object.fromEntries(validKeys.map((k: string) => [k, true])),
        names: Object.fromEntries(validKeys.map((k: string) => [k, "/Citations"]))
      };
    } catch {
      return { ids: {}, names: {} };
    }
  }

  /**
   * Persists currently managed citation tag IDs and names to preferences.
   * @returns {boolean} True if write succeeded
   * @private
   */
  _saveManagedTagIDs(this: PrefContext) {
    try {
      const tags = Object.fromEntries(
        Object.keys(this._managedCitationTagIDs || {}).map(id => [id, this._managedCitationTagNames?.[id] || "/Citations"])
      );
      Zotero.Prefs.set(MANAGED_TAG_STATE_PREF, JSON.stringify({ version: 1, tags }));
      Zotero.Prefs.set(MANAGED_TAG_IDS_PREF, JSON.stringify(Object.keys(this._managedCitationTagIDs || {})));
      return true;
    } catch (error) {
      this.logError("Failed to save managed citation tag state", error);
      return false;
    }
  }
}
