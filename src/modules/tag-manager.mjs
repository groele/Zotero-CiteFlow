// Citation Tag Synchronization & Governance Service for CiteFlow

export const MANAGED_TAG_IDS_PREF = "zotero-citation.managedCitationTagIDs";
export const MANAGED_TAG_STATE_PREF = "zotero-citation.managedCitationTagState";

export class TagManagerService {
  static isWritableCitationItem(item) {
    const userLibraryID = Zotero.Libraries?.userLibraryID;
    if (!item || item.libraryID !== userLibraryID || item.editable === false) {
      return false;
    }
    try {
      if (typeof item.isEditable === "function" && !item.isEditable()) {
        return false;
      }
      const library = typeof Zotero.Libraries?.get === "function"
        ? Zotero.Libraries.get(item.libraryID)
        : null;
      if (library?.editable === false || library?.readOnly === true) {
        return false;
      }
      if (typeof library?.isEditable === "function" && !library.isEditable()) {
        return false;
      }
      if (typeof library?.editable === "function" && !library.editable()) {
        return false;
      }
    } catch {
      return false;
    }
    return true;
  }

  static loadManagedTagState() {
    let raw;
    try {
      raw = Zotero.Prefs.get(MANAGED_TAG_STATE_PREF);
      const state = raw && JSON.parse(raw);
      if (state?.version === 1 && state.tags && typeof state.tags === "object" && !Array.isArray(state.tags)) {
        const entries = Object.entries(state.tags).filter(([id, name]) =>
          Number.isSafeInteger(Number(id)) && Number(id) > 0
          && typeof name === "string" && name.trim() && name.length <= 200 && !/[\x00-\x1f\x7f]/.test(name));
        return {
          ids: Object.fromEntries(entries.map(([id]) => [id, true])),
          names: Object.fromEntries(entries)
        };
      }
      if (raw) throw new Error("Unsupported managed citation tag state");
    } catch (error) {
      Zotero.logError(new Error("Failed to read managed citation tag state", { cause: error }));
    }

    if (raw) return { ids: {}, names: {} };

    try {
      let rawKeys = Zotero.Prefs.get(MANAGED_TAG_IDS_PREF);
      if (!rawKeys) {
        const legacyRaw = Zotero.Prefs.get(MANAGED_TAG_IDS_PREF, true);
        if (legacyRaw) rawKeys = legacyRaw;
      }
      const keys = rawKeys ? JSON.parse(rawKeys) : [];
      const validKeys = Array.isArray(keys) ? keys.filter(k => typeof k === "string" && k) : [];
      return {
        ids: Object.fromEntries(validKeys.map(k => [k, true])),
        names: Object.fromEntries(validKeys.map(k => [k, "/Citations"]))
      };
    } catch {
      return { ids: {}, names: {} };
    }
  }

  static saveManagedTagIDs(managedCitationTagIDs, managedCitationTagNames) {
    try {
      const tags = Object.fromEntries(
        Object.keys(managedCitationTagIDs).map(id => [id, managedCitationTagNames?.[id] || "/Citations"])
      );
      Zotero.Prefs.set(MANAGED_TAG_STATE_PREF, JSON.stringify({ version: 1, tags }));
      Zotero.Prefs.set(MANAGED_TAG_IDS_PREF, JSON.stringify(Object.keys(managedCitationTagIDs)));
      return true;
    } catch (error) {
      Zotero.logError(new Error("Failed to save managed citation tag state", { cause: error }));
      return false;
    }
  }
}
