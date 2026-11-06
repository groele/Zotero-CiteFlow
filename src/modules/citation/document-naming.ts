import { getString } from "../locale.ts";

// ============================================================================
// Document Name Sanitization & Formatting
// ============================================================================

type DocumentDescriptor = {docId?:unknown;documentPath?:unknown;documentName?:unknown;fullName?:unknown;filePath?:unknown;path?:unknown;url?:unknown;uri?:unknown;filename?:unknown;title?:unknown;name?:unknown};
type NativeSession = DocumentDescriptor & {_doc?:DocumentDescriptor | string;doc?:DocumentDescriptor | string};
type NamingContext = CitationDocumentNaming & {sessions:Record<string,{closing?:boolean;docId?:string}>;_docIdBySession:Record<string,string>;_pendingCollectionNames:Map<string,number>;_pendingCollectionNumber:number;activeSessionID:string|null};
declare const addon: {data?: {lastDroppedWordWindow?:{title:string;at:number};probeWordWindowTitles?:()=>{foregroundTitle?:string;visibleTitles?:string[]}}};
type NamingHost = {ZoteroCitation?:{api?:{sessions?:unknown;sessionRevision?:number;activeSessionID?:string|null}}};

export class CitationDocumentNaming {
  /**
   * Strips control characters, collapses whitespace, and clamps folder names to 200 characters.
   * @param {string} rawName - Raw folder name candidate
   * @returns {string} Sanitized folder name
   * @private
   */
  _sanitizeFolderName(this: NamingContext, rawName: unknown) {
    const fallback = "Untitled Document";
    const raw = typeof rawName === "string" ? rawName : String(rawName || "");
    const noControlChars = raw.replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\uFEFF]/g, " ");
    const normalized = noControlChars.replace(/\s+/g, " ").trim();
    const maxLength = 200;
    return (normalized || fallback).slice(0, maxLength);
  }

  /**
   * Extracts a clean document display name from a Microsoft Word window title.
   * @param {string} rawTitle - Raw Win32 Word window title or prefixed marker
   * @returns {string} Extracted document name or empty string
   * @private
   */
  _parseWordWindowTitle(this: NamingContext, rawTitle: unknown) {
    if (typeof rawTitle !== "string") return "";
    let cleaned = rawTitle.replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\uFEFF]/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    if (cleaned.startsWith("window-title:")) {
      cleaned = cleaned.slice("window-title:".length).trim();
      if (!cleaned) return "";
      if (!/\s+[-–—]\s+(?:Microsoft\s+)?Word(?:\s*\([^)]*\))?$/i.test(cleaned)) {
        try { return this._sanitizeFolderName(cleaned.normalize("NFC")); } catch { return this._sanitizeFolderName(cleaned); }
      }
    }
    const wordSuffixRe = /\s+[-–—]\s+(?:Microsoft\s+)?Word(?:\s*\([^)]*\))?$/i;
    if (!wordSuffixRe.test(cleaned)) return "";
    let body = cleaned.replace(wordSuffixRe, "").trim();
    if (!body) return "";

    const extMatch = body.match(/^(.+?\.(?:docx|docm|doc|dotx|dotm|rtf|odt))(?:\s*\[[^\]]*\]|\s+[-–—]\s+.*)*$/i);
    if (extMatch) {
      body = extMatch[1].trim();
    } else {
      const statusRe = /(?:\s*\[(?:兼容模式|Compatibility Mode|只读|Read-Only|受保护的视图|Protected View|自动保存|AutoSave)[^\]]*\]|\s+[-–—]\s+(?:已保存.*|正在保存.*|上次保存.*|只读|兼容模式|受保护的视图|未保存|Saved.*|Saving.*|Last saved.*|Read-Only|Compatibility Mode|Protected View|Unsaved))\s*$/i;
      let prev;
      do {
        prev = body;
        body = body.replace(statusRe, "").trim();
      } while (body && body !== prev);
    }
    if (!body || /^(?:Microsoft\s+)?Word$/i.test(body)) return "";
    try {
      return this._sanitizeFolderName(body.normalize("NFC"));
    } catch {
      return this._sanitizeFolderName(body);
    }
  }

  /**
   * Resolves a sanitized display name for a Word document from its file path, URI, or window title.
   * @param {string} docId - Raw document URI, path, or window-title identifier
   * @returns {string} Normalized document display name or empty string
   * @private
   */
  _getDocumentDisplayName(this: NamingContext, docId: unknown) {
    let raw = typeof docId === "string" ? docId.trim() : String(docId || "").trim();
    if (!raw || raw === "__doc__") return "";
    raw = raw.replace(/^(["'])(.*)\1$/, "$2").trim();
    if (raw.startsWith("window-title:") || /\s+[-–—]\s+(?:Microsoft\s+)?Word(?:\s*\([^)]*\))?$/i.test(raw)) {
      return this._parseWordWindowTitle(raw);
    }
    const isURL = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
    const withoutQuery = isURL ? raw.replace(/[?#].*$/, "") : raw;
    if (isURL && /(?:\/|^)(?:Doc|WopiFrame2?|redir)\.aspx$/i.test(withoutQuery)) {
      const fileParam = raw.match(/[?&](?:file|filename|name)=([^&#]+)/i);
      if (fileParam?.[1]) {
        try {
          const decodedParam = decodeURIComponent(fileParam[1].replace(/\+/g, "%20")).trim();
          if (decodedParam && !/[\\/]/.test(decodedParam)) {
            return this._sanitizeFolderName(decodedParam.normalize("NFC"));
          }
        } catch {}
      }
    }
    if (!withoutQuery || /[\\\/]$/.test(withoutQuery)) return "";
    const normalizedPath = withoutQuery.replace(/\\/g, "/");
    let candidate = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
    if (isURL) {
      if (/%(?:2f|5c)/i.test(candidate)) return "";
      try {
        candidate = decodeURIComponent(candidate);
      } catch {
        candidate = candidate.replace(/(?:%[0-9A-Fa-f]{2})+/g, match => {
          try { return decodeURIComponent(match); } catch { return match; }
        });
      }
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
   * Extracts a document identifier from a native session or document object if available.
   * @param {object} [nativeSession] - Native Zotero Integration session
   * @param {object|string} [docObj] - Document reference passed to getSession
   * @returns {string} Validated document identifier or empty string
   * @private
   */
  _extractSessionDocumentId(this: NamingContext, nativeSession?: NativeSession, docObj?: DocumentDescriptor | string) {
    const doc = docObj ?? nativeSession?._doc ?? nativeSession?.doc;
    const descriptor = typeof doc === "object" && doc !== null ? doc : undefined;
    const candidates = [
      typeof doc === "string" ? doc : null,
      descriptor?.docId, descriptor?.documentPath, descriptor?.documentName, descriptor?.fullName,
      descriptor?.filePath, descriptor?.path, descriptor?.url, descriptor?.uri, descriptor?.filename, descriptor?.title, descriptor?.name,
      nativeSession?.docId, nativeSession?.documentPath, nativeSession?.documentName,
      nativeSession?.filePath, nativeSession?.path, nativeSession?.title, nativeSession?.name
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim() && this._getDocumentDisplayName(candidate)) {
        return candidate.trim();
      }
    }
    return "";
  }

  /**
   * Resolves a fallback document identifier from session metadata or unambiguous Win32 Word window titles.
   * @param {string} sessionID - Session identifier
   * @param {object} [nativeSession] - Native Word session
   * @param {object} [docObj] - Document object
   * @param {boolean} [allowForeground=false] - Whether to inspect dropped/foreground Word windows
   * @returns {string} Resolved document identifier or empty string
   * @private
   */
  _resolveFallbackDocumentId(this: NamingContext, sessionID: string, nativeSession?: NativeSession, docObj?: DocumentDescriptor | string, allowForeground = false) {
    const fromSession = this._extractSessionDocumentId(nativeSession, docObj);
    if (fromSession) return fromSession;

    const addonData = typeof addon !== "undefined" ? addon?.data : null;
    if (allowForeground && addonData?.lastDroppedWordWindow) {
      const { title, at } = addonData.lastDroppedWordWindow;
      delete addonData.lastDroppedWordWindow;
      if (typeof at === "number" && Date.now() - at <= 15000) {
        const droppedName = this._parseWordWindowTitle(title);
        if (droppedName) return `window-title:${droppedName}`;
      }
    }

    if (typeof addonData?.probeWordWindowTitles === "function") {
      const probed = addonData.probeWordWindowTitles();
      const claimedByOthers = new Set();
      let otherUnidentifiedCount = 0;
      for (const otherID of Object.keys(this.sessions || {})) {
        if (otherID === sessionID || this.sessions[otherID]?.closing) continue;
        const otherDocId = this._docIdBySession?.[otherID] || this.sessions[otherID]?.docId;
        const otherName = otherDocId ? this._getDocumentDisplayName(otherDocId) : "";
        if (otherName) claimedByOthers.add(otherName);
        else otherUnidentifiedCount++;
      }
      if (allowForeground && probed?.foregroundTitle) {
        const fgName = this._parseWordWindowTitle(probed.foregroundTitle);
        if (fgName && !claimedByOthers.has(fgName)) return `window-title:${fgName}`;
      }
      const visibleNames = [...new Set(
        (probed?.visibleTitles || []).map(t => this._parseWordWindowTitle(t)).filter(Boolean)
      )];
      if (visibleNames.length > 0) {
        const unclaimed = visibleNames.filter(name => !claimedByOthers.has(name));
        if (visibleNames.length === 1 && otherUnidentifiedCount === 0 && !claimedByOthers.has(visibleNames[0])) {
          return `window-title:${visibleNames[0]}`;
        }
        if (unclaimed.length === 1 && otherUnidentifiedCount === 0) {
          return `window-title:${unclaimed[0]}`;
        }
      }
    }

    return this._docIdBySession?.[sessionID] || this.sessions?.[sessionID]?.docId || "";
  }

  /**
   * Checks whether a collection name is still an unidentified pending placeholder.
   * @param {string} name - Collection name
   * @param {string} [sessionID] - Optional session identifier
   * @returns {boolean}
   * @private
   */
  _isPendingCollectionName(this: NamingContext, name: string, sessionID?: string) {
    if (!name || typeof name !== "string") return true;
    const prefix = getString("collection-pending");
    if (sessionID && this._pendingCollectionNames?.has(sessionID)) {
      if (name === `${prefix} ${this._pendingCollectionNames.get(sessionID)}`) return true;
    }
    return Boolean(prefix && name.startsWith(`${prefix} `));
  }

  /**
   * Generates a sequenced pending collection name for an unidentified Word session.
   * @param {string} sessionID - Word session identifier
   * @returns {string} Sequenced pending name
   * @private
   */
  _getPendingCollectionName(this: NamingContext, sessionID: string) {
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
  _invalidateSessionIndex(this: NamingContext) {
    const api = (Zotero as unknown as NamingHost).ZoteroCitation?.api;
    if (api?.sessions === this.sessions) api.sessionRevision = (api.sessionRevision || 0) + 1;
  }

  /**
   * Sets the active session ID across internal state and public API.
   * @param {string|null} sessionID - Active session identifier
   * @private
   */
  _setActiveSessionID(this: NamingContext, sessionID: string | null) {
    const normalized = typeof sessionID === "string" && sessionID ? sessionID : null;
    this.activeSessionID = normalized;
    try {
      if ((Zotero as unknown as NamingHost).ZoteroCitation?.api) (Zotero as unknown as NamingHost).ZoteroCitation!.api!.activeSessionID = normalized;
    } catch {}
  }
}
