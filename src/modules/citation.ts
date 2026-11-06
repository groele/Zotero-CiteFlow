import type { InitContext } from "./citation/initializers.ts";
import {
  TEMP_COLLECTION_RELATION,
  TEMP_COLLECTION_MARKER,
  LEGACY_UPSTREAM_TEMP_COLLECTION_MARKER,
  TEMP_COLLECTION_KEYS_PREF,
  TEMP_SEARCH_KEYS_PREF,
  MANAGED_TAG_IDS_PREF,
  MANAGED_TAG_STATE_PREF
} from "./citation/constants.ts";
import { CitationInitializers } from "./citation/initializers.ts";
import { CitationTelemetry } from "./citation/telemetry.ts";
import { CitationPreferences } from "./citation/preferences-sync.ts";
import { CitationDocumentNaming } from "./citation/document-naming.ts";
import { CitationCollections } from "./citation/collections.ts";
import { CitationWordIntegration } from "./citation/word-integration.ts";
import { CitationOrderCache } from "./citation/order-cache.ts";
import { CitationTagGovernance } from "./citation/tag-governance.ts";
import { CitationFormatting } from "./citation/formatting.ts";
import { CitationLifecycle } from "./citation/lifecycle.ts";
import { composeDomains } from "./domain-composition.ts";

export {
  TEMP_COLLECTION_RELATION,
  TEMP_COLLECTION_MARKER,
  LEGACY_UPSTREAM_TEMP_COLLECTION_MARKER,
  TEMP_COLLECTION_KEYS_PREF,
  TEMP_SEARCH_KEYS_PREF,
  MANAGED_TAG_IDS_PREF,
  MANAGED_TAG_STATE_PREF
};

export const CITATION_DOMAIN_MODULES = [
  CitationInitializers,
  CitationTelemetry,
  CitationPreferences,
  CitationDocumentNaming,
  CitationCollections,
  CitationWordIntegration,
  CitationOrderCache,
  CitationTagGovernance,
  CitationFormatting,
  CitationLifecycle
];

type DomainMethods = CitationInitializers & CitationTelemetry & CitationPreferences & CitationDocumentNaming & CitationCollections & CitationWordIntegration & CitationOrderCache & CitationTagGovernance & CitationFormatting & CitationLifecycle;
type DomainContexts = ThisParameterType<CitationTelemetry["logError"]> & ThisParameterType<CitationPreferences["applyPreferences"]> & ThisParameterType<CitationDocumentNaming["_getDocumentDisplayName"]> & ThisParameterType<CitationCollections["clearStaleArtifacts"]> & ThisParameterType<CitationWordIntegration["listener"]> & ThisParameterType<CitationOrderCache["getSortedItemIDs"]> & ThisParameterType<CitationTagGovernance["syncCitationTags"]> & ThisParameterType<CitationFormatting["refreshSessionCitations"]> & ThisParameterType<CitationLifecycle["clear"]>;
type VerifyNonNever<T extends false> = T;
type VerifyCitationContext = VerifyNonNever<[DomainContexts] extends [never] ? true : false>;
export interface Citation extends Omit<InitContext, keyof DomainMethods | keyof DomainContexts>, DomainContexts, CitationInitializers {}
export class Citation {
  /**
   * Constructs the CiteFlow citation coordinator and initializes all domain subsystems.
   */
  constructor() {
    this._initSessionTracking();
    this._initDiagnosticsAndTelemetry();
    this._bindPublicApi();
    this._initPreferencesAndConfig();
    this._initWordIntegrationState();
    this._initTimersAndDebounce();
  }
}

composeDomains(Citation.prototype, CITATION_DOMAIN_MODULES);
