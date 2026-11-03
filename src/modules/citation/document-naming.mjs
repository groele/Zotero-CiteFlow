import { getString } from "../locale.mjs";

// ============================================================================
// Document Name Sanitization & Formatting
// ============================================================================

export class CitationDocumentNaming {
  /**
   * Strips control characters, collapses whitespace, and clamps folder names to 200 characters.
   * @param {string} rawName - Raw folder name candidate
   * @returns {string} Sanitized folder name
   * @private
   */
  _sanitizeFolderName(rawName) {
    const fallback = "Untitled Document";
    const raw = typeof rawName === "string" ? rawName : String(rawName || "");
    const noControlChars = raw.replace(/[\u0000-\u001F\u007F]/g, " ");
    const normalized = noControlChars.replace(/\s+/g, " ").trim();
    const maxLength = 200;
    return (normalized || fallback).slice(0, maxLength);
  }

  /**
   * Resolves a sanitized display name for a Word document from its file path or URI.
   * @param {string} docId - Raw document URI or path identifier
   * @returns {string} Normalized document display name or empty string
   * @private
   */
  _getDocumentDisplayName(docId) {
    let raw = typeof docId === "string" ? docId.trim() : String(docId || "").trim();
    if (!raw || raw === "__doc__") return "";
    raw = raw.replace(/^(["'])(.*)\1$/, "$2").trim();
    const isURL = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
    const withoutQuery = isURL ? raw.replace(/[?#].*$/, "") : raw;
    if (!withoutQuery || /[\\\/]$/.test(withoutQuery)) return "";
    const normalizedPath = withoutQuery.replace(/\\/g, "/");
    let candidate = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
    if (isURL) {
      try { candidate = decodeURIComponent(candidate); } catch { return ""; }
      if (/[\\/]/.test(candidate)) return "";
    }
    if (!candidate || candidate === "." || candidate === ".." || /^[a-z][a-z0-9+.-]*:$/i.test(candidate)) {
      return "";
    }
    try {
      return this._sanitizeFolderName(candidate.normalize("NFC"));
    } catch {
      return this._sanitizeFolderName(candidate);
    }
  }

  /**
   * Generates a sequenced pending collection name for an unidentified Word session.
   * @param {string} sessionID - Word session identifier
   * @returns {string} Sequenced pending name
   * @private
   */
  _getPendingCollectionName(sessionID) {
    this._pendingCollectionNames ??= new Map();
    if (!this._pendingCollectionNames.has(sessionID)) {
      this._pendingCollectionNumber = (this._pendingCollectionNumber || 0) + 1;
      this._pendingCollectionNames.set(sessionID, this._pendingCollectionNumber);
    }
    return `${getString("collection-pending")} ${this._pendingCollectionNames.get(sessionID)}`;
  }

  /**
   * Increments the session revision index to invalidate cached view mappings.
   * @private
   */
  _invalidateSessionIndex() {
    const api = Zotero.ZoteroCitation?.api;
    if (api?.sessions === this.sessions) api.sessionRevision = (api.sessionRevision || 0) + 1;
  }

  /**
   * Sets the active session ID across internal state and public API.
   * @param {string|null} sessionID - Active session identifier
   * @private
   */
  _setActiveSessionID(sessionID) {
    const normalized = typeof sessionID === "string" && sessionID ? sessionID : null;
    this.activeSessionID = normalized;
    try {
      if (Zotero.ZoteroCitation?.api) Zotero.ZoteroCitation.api.activeSessionID = normalized;
    } catch {}
  }
}
