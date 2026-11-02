// Microsoft Word Process Integration & Document Interception Service for CiteFlow

export class WordIntegrationService {
  static sanitizeFolderName(rawName) {
    const fallback = "Untitled Document";
    const raw = typeof rawName === "string" ? rawName : String(rawName || "");
    const noControlChars = raw.replace(/[\u0000-\u001F\u007F]/g, " ");
    const normalized = noControlChars.replace(/\s+/g, " ").trim();
    const maxLength = 200;
    return (normalized || fallback).slice(0, maxLength);
  }

  static getDocumentDisplayName(docId) {
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
      return WordIntegrationService.sanitizeFolderName(candidate.normalize("NFC"));
    } catch {
      return WordIntegrationService.sanitizeFolderName(candidate);
    }
  }

  static isWordAgent(agent) {
    return /(WinWord|MacWord|Word)/i.test(String(agent || ""));
  }
}
