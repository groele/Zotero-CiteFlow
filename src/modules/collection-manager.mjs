// Zotero Document Temporary Collection Management Service for CiteFlow

export const TEMP_COLLECTION_RELATION = "dc:relation";
export const TEMP_COLLECTION_MARKER = "https://github.com/groele/Zotero-CiteFlow#temporary-collection";
export const LEGACY_UPSTREAM_TEMP_COLLECTION_MARKER = "https://github.com/MuiseDestiny/zotero-citation#temporary-collection";

export const TEMP_COLLECTION_KEYS_PREF = "zotero-citation.temporaryCollectionKeys";
export const TEMP_SEARCH_KEYS_PREF = "zotero-citation.managedSearchKeys";

export class CollectionManagerService {
  static loadKeySet(prefKey) {
    try {
      let raw = Zotero.Prefs.get(prefKey);
      if (!raw) {
        const legacyRaw = Zotero.Prefs.get(prefKey, true);
        if (legacyRaw) {
          raw = legacyRaw;
          Zotero.Prefs.set(prefKey, legacyRaw);
        }
      }
      const values = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(values) ? values.filter(v => typeof v === "string" && v) : []);
    } catch {
      return new Set();
    }
  }

  static saveKeySet(prefKey, values) {
    try {
      Zotero.Prefs.set(prefKey, JSON.stringify([...values]));
    } catch (error) {
      Zotero.logError(new Error(`Failed to save preference ${prefKey}`, { cause: error }));
    }
  }

  static async clearStaleArtifacts(temporaryCollectionKeys, managedSearchKeys) {
    const libraryID = Zotero.Libraries.userLibraryID;
    const collections = Zotero.Collections.getByLibrary(libraryID, true, true);
    const collectionsByKey = new Map(collections.map(c => [c.key, c]));
    const removedKeys = new Set();
    const remainingKeys = new Set();

    for (const key of temporaryCollectionKeys) {
      const collection = collectionsByKey.get(key);
      if (!collection) continue;
      try {
        await collection.eraseTx();
        removedKeys.add(key);
      } catch (error) {
        remainingKeys.add(key);
        Zotero.logError(new Error("Failed to remove a stale citation collection", { cause: error }));
      }
    }

    for (const collection of collections) {
      if (removedKeys.has(collection.key)) continue;
      try {
        await collection.loadDataType("relations");
        const relations = collection.getRelationsByPredicate(TEMP_COLLECTION_RELATION) || [];
        if (relations.includes(TEMP_COLLECTION_MARKER) || relations.includes(LEGACY_UPSTREAM_TEMP_COLLECTION_MARKER)) {
          await collection.eraseTx();
        }
      } catch (error) {
        Zotero.logError(new Error("Failed to remove a stale citation collection", { cause: error }));
      }
    }

    temporaryCollectionKeys.clear();
    for (const key of remainingKeys) temporaryCollectionKeys.add(key);
    CollectionManagerService.saveKeySet(TEMP_COLLECTION_KEYS_PREF, temporaryCollectionKeys);

    if (!managedSearchKeys?.size) return;
    const searchesByKey = new Map(Zotero.Searches.getByLibrary(libraryID).map(s => [s.key, s]));
    for (const key of [...managedSearchKeys]) {
      const search = searchesByKey.get(key);
      if (!search) {
        managedSearchKeys.delete(key);
        continue;
      }
      try {
        await search.eraseTx();
        managedSearchKeys.delete(key);
      } catch (error) {
        Zotero.logError(new Error("Failed to remove a legacy citation search", { cause: error }));
      }
    }
    CollectionManagerService.saveKeySet(TEMP_SEARCH_KEYS_PREF, managedSearchKeys);
  }

  static async createSessionCollection(sessionID, session, collectionName, temporaryCollectionKeys) {
    if (!session) return;
    const collection = new Zotero.Collection();
    collection.libraryID = Zotero.Libraries.userLibraryID;
    collection.name = collectionName;
    try {
      if (typeof collection.addRelation === "function") {
        collection.addRelation(TEMP_COLLECTION_RELATION, TEMP_COLLECTION_MARKER);
      }
    } catch (error) {
      Zotero.logError(new Error("Failed to mark temporary Word citation collection", { cause: error }));
    }
    await collection.saveTx({ skipSelect: true });
    temporaryCollectionKeys.add(collection.key);
    CollectionManagerService.saveKeySet(TEMP_COLLECTION_KEYS_PREF, temporaryCollectionKeys);
    session.collection = collection;
    return collection;
  }

  static async syncCollectionItems(session, targetIDs, isStopped = () => false) {
    const collection = session?.collection;
    if (isStopped() || session?.closing || !collection?.id) return;

    const normalizedTargetIDs = [...new Set(targetIDs.map(Number).filter(Number.isInteger))];
    const currentIDs = collection.getChildItems(true)
      .map(itemOrID => typeof itemOrID === "number" ? itemOrID : itemOrID?.id)
      .filter(Number.isInteger);

    const targetSet = new Set(normalizedTargetIDs);
    const currentSet = new Set(currentIDs);
    const remove = currentIDs.filter(id => !targetSet.has(id));
    const add = normalizedTargetIDs.filter(id => !currentSet.has(id));

    if (!remove.length && !add.length) return;

    await Zotero.DB.executeTransaction(async () => {
      if (isStopped() || session.closing) return;
      if (remove.length) await collection.removeItems(remove);
      if (add.length) await collection.addItems(add);
    });
  }
}
