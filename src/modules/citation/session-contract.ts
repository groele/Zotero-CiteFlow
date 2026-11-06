/** Stable data shared by the citation coordinator and the item-tree view. */
export interface CitationEntry {
  plainCitation?: string;
}
export interface CitationCollectionRef {
  key?: string;
  libraryID?: number;
}
export interface CitationSessionSnapshot {
  closing?: boolean;
  collection?: CitationCollectionRef;
  idData?: Record<string, CitationEntry>;
}
export interface CitationSessionApi {
  sessions?: Record<string, CitationSessionSnapshot>;
  sessionRevision?: number;
  activeSessionID?: string;
}
