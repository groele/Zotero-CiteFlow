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
      if (!session || session.closing) continue;
      const key = session?.collection?.key;
      if (key) {
        const matches = index.byKey.get(key) || [];
        matches.push(session);
        index.byKey.set(key, matches);
      }
      for (const id of Object.keys(session?.idData || {})) {
        const numericId = Number(id);
        if (!Number.isSafeInteger(numericId) || numericId <= 0) continue;
        const matches = index.byItem.get(numericId) || [];
        matches.push(session);
        index.byItem.set(numericId, matches);
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
      const numericID = Number(itemID);
      if (!Number.isSafeInteger(numericID) || numericID <= 0) return "";
      const api = Zotero.ZoteroCitation?.api || {};
      const index = this._getSessionIndex(api);
      const wordSessions = this._resolveSelectedCollectionSessions(index);

      if (wordSessions.size) {
        const matches = [...wordSessions].filter(session => session.idData?.[numericID] || session.idData?.[itemID]);
        if (matches.length !== 1) return "";
        const entry = matches[0].idData[numericID] ?? matches[0].idData[itemID];
        return entry?.plainCitation || "";
      }
      const currentSessionID = Zotero.Integration.currentSession?.sessionID;
      const active = api.activeSessionID && index.sessions[api.activeSessionID] && !index.sessions[api.activeSessionID].closing
        ? api.activeSessionID
        : (currentSessionID && index.sessions[currentSessionID] && !index.sessions[currentSessionID].closing ? currentSessionID : null);
      if (active) {
        const activeSession = index.sessions[active];
        const entry = activeSession?.idData?.[numericID] ?? activeSession?.idData?.[itemID];
        return entry?.plainCitation || "";
      }
      const matches = index.byItem.get(numericID) || [];
      if (matches.length !== 1) return "";
      const entry = matches[0].idData[numericID] ?? matches[0].idData[itemID];
      return entry?.plainCitation || "";
    } catch (error) {
      runtime.log("Citation column lookup failed", error);
      return "";
    }
  }
}
