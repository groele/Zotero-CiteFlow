import {
  TEMP_COLLECTION_RELATION,
  TEMP_COLLECTION_MARKER,
  LEGACY_UPSTREAM_TEMP_COLLECTION_MARKER,
  TEMP_COLLECTION_KEYS_PREF,
  TEMP_SEARCH_KEYS_PREF,
  MANAGED_TAG_IDS_PREF,
  MANAGED_TAG_STATE_PREF
} from "./citation/constants.mjs";
import { CitationInitializers } from "./citation/initializers.mjs";
import { CitationTelemetry } from "./citation/telemetry.mjs";
import { CitationPreferences } from "./citation/preferences-sync.mjs";
import { CitationDocumentNaming } from "./citation/document-naming.mjs";
import { CitationCollections } from "./citation/collections.mjs";
import { CitationWordIntegration } from "./citation/word-integration.mjs";
import { CitationOrderCache } from "./citation/order-cache.mjs";
import { CitationTagGovernance } from "./citation/tag-governance.mjs";
import { CitationFormatting } from "./citation/formatting.mjs";
import { CitationLifecycle } from "./citation/lifecycle.mjs";

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

for (const DomainClass of CITATION_DOMAIN_MODULES) {
  const descriptors = Object.getOwnPropertyDescriptors(DomainClass.prototype);
  delete descriptors.constructor;
  Object.defineProperties(Citation.prototype, descriptors);
}
