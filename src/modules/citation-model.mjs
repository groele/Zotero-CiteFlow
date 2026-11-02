// Citation Mathematical and Parsing Model for CiteFlow

export class CitationModelService {
  static getSortedCacheKey(sessionID) {
    return `cache_${sessionID}`;
  }

  static getSortedCache(sortedCacheBySession, sessionID) {
    if (!sortedCacheBySession || typeof sortedCacheBySession !== "object") return undefined;
    const key = CitationModelService.getSortedCacheKey(sessionID);
    const cache = sortedCacheBySession[key];
    if (!cache || typeof cache.sig !== "string" || !Array.isArray(cache.result)
      || cache.result.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      return undefined;
    }
    return cache;
  }

  static setSortedCache(sortedCacheBySession, sessionID, sig, result) {
    if (!sortedCacheBySession || typeof sortedCacheBySession !== "object") return;
    const key = CitationModelService.getSortedCacheKey(sessionID);
    sortedCacheBySession[key] = { sig, result: [...result] };
  }

  static computeSortedItemIDs(citationsByIndex, sessionID, sortedCacheBySession) {
    citationsByIndex ??= {};
    try {
      const indexKeys = Object.keys(citationsByIndex).sort((a, b) => Number(a) - Number(b));
      const parts = [];
      const seenIDs = new Set();
      const sortedItemIDs = [];

      for (const key of indexKeys) {
        const values = [];
        const items = Array.isArray(citationsByIndex[key]?.citationItems)
          ? citationsByIndex[key].citationItems
          : [];
        for (const item of items) {
          if (!item || (typeof item.id !== "number" && typeof item.id !== "string")) continue;
          const id = Number(item.id);
          if (!Number.isSafeInteger(id) || id <= 0) continue;
          values.push(id);
          if (!seenIDs.has(id)) {
            seenIDs.add(id);
            sortedItemIDs.push(id);
          }
        }
        parts.push(key + ":" + values.join(",") + ";");
      }

      const sig = parts.join("") || "_empty";
      const cache = CitationModelService.getSortedCache(sortedCacheBySession, sessionID);
      if (cache?.sig === sig) return [...cache.result];

      CitationModelService.setSortedCache(sortedCacheBySession, sessionID, sig, sortedItemIDs);
      return sortedItemIDs;
    } catch (e) {
      runtime?.log?.("[Citation] ERROR in computeSortedItemIDs:", e);
      const cache = CitationModelService.getSortedCache(sortedCacheBySession, sessionID);
      return cache?.result ? [...cache.result] : [];
    }
  }

  static formatPlainCitation(id, idIndexMap, citationsByItemID, isNoteStyle, oldIdData = {}) {
    const index = idIndexMap.get(Number(id));
    if (index === undefined) {
      const previousValue = oldIdData[id]?.plainCitation;
      if (previousValue) return previousValue;
      return isNoteStyle ? "—" : "—: (pending)";
    }

    const order = index + 1;
    if (isNoteStyle) {
      return String(order);
    }

    const citations = citationsByItemID[id];
    if (!Array.isArray(citations) || citations.length === 0) {
      return `${order}: (error)`;
    }

    return `${order}: ` + citations.map(i => i?.properties?.plainCitation || "(no text)").join(", ");
  }

  static buildCitationTagSig(sortedItemIDs) {
    if (!Array.isArray(sortedItemIDs) || sortedItemIDs.length === 0) return "";
    const uniq = Array.from(new Set(
      sortedItemIDs.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)
    )).sort((a, b) => a - b);
    return uniq.join(",");
  }
}
