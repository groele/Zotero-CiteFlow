import type { CitationSessionSnapshot } from "./session-contract.ts";
export interface CitationSortCache { sig: string; result: number[] }
/** State owned by the coordinator and used by ordering and teardown domains. */
export interface CitationSharedState {
  sessions: Record<string, CitationSessionSnapshot>;
  _sortedCacheBySession: Record<string, CitationSortCache>;
  _sessionUpdateRevision: Record<string, number>;
  _pendingCollectionNames: Map<string, number>;
}
