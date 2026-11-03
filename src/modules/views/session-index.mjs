// ============================================================================
// Views Session Index & Citation Text Resolution
// ============================================================================

export class ViewsSessionIndex {
  /**
   * Computes an indexed lookup cache from collection keys and item IDs to active sessions.
   * Invalidation is governed by api.sessionRevision.
   * @param {object} api - Coordinator API object
   * @returns {object} Indexed session cache
   * @private
   */
  _getSessionIndex(api) {
    const sessions = api.sessions || {};
    const revision = api.sessionRevision;
    if (Number.isSafeInteger(revision) && this._index?.sessions === sessions && this._index.revision === revision) {
      return this._index;
    }
    const index = { sessions, revision, byKey: new Map(), byItem: new Map() };
    for (const session of Object.values(sessions)) {
      const key = session?.collection?.key;
      if (key) {
        const matches = index.byKey.get(key) || [];
        matches.push(session);
        index.byKey.set(key, matches);
      }
      for (const id of Object.keys(session?.idData || {})) {
        const matches = index.byItem.get(Number(id)) || [];
        matches.push(session);
        index.byItem.set(Number(id), matches);
      }
    }
    this._index = index;
    return index;
  }

  /**
   * Resolves active Word sessions corresponding to currently selected Zotero collections.
   * @param {object} index - Session lookup index
   * @returns {Set<object>} Matching Word sessions
   * @private
   */
  _resolveSelectedCollectionSessions(index) {
    const pane = this.pane;
    const getSelected = pane?.getSelectedCollections || pane?.collectionsView?.getSelectedCollections;
    let selected = [];
    try {
      if (getSelected) selected = getSelected.call(pane.getSelectedCollections ? pane : pane.collectionsView) || [];
    } catch (error) {
      runtime.log("Cannot resolve citation collection selection", error);
    }
    const wordSessions = new Set();
    for (const collection of selected) {
      let candidates = index.byKey.get(collection?.key) || [];
      if (collection.libraryID == null && candidates.length !== 1) continue;
      if (collection.libraryID != null) {
        candidates = candidates.filter(session => session.collection.libraryID == null || session.collection.libraryID === collection.libraryID);
      }
      for (const session of candidates) wordSessions.add(session);
    }
    return wordSessions;
  }

  /**
   * Resolves the formatted plain citation text for a library item.
   * Prioritizes selected collections, then active Word session, then unique item match.
   * @param {number|string} itemID - Zotero item ID
   * @returns {string} Formatted citation string or empty string
   */
  getCitationText(itemID) {
    try {
      const api = Zotero.ZoteroCitation?.api || {};
      const index = this._getSessionIndex(api);
      const wordSessions = this._resolveSelectedCollectionSessions(index);

      if (wordSessions.size) {
        const matches = [...wordSessions].filter(session => session.idData?.[itemID]);
        return matches.length === 1 ? matches[0].idData[itemID].plainCitation || "" : "";
      }
      const active = api.activeSessionID && index.sessions[api.activeSessionID]
        ? api.activeSessionID : Zotero.Integration.currentSession?.sessionID;
      if (active) return index.sessions[active]?.idData?.[itemID]?.plainCitation || "";
      const matches = index.byItem.get(Number(itemID)) || [];
      return matches.length === 1 ? matches[0].idData[itemID].plainCitation || "" : "";
    } catch (error) {
      runtime.log("Citation column lookup failed", error);
      return "";
    }
  }
}
