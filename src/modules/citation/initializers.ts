import { TEMP_COLLECTION_KEYS_PREF, TEMP_SEARCH_KEYS_PREF } from "./constants.ts";

import type { CitationSharedState } from "./state-contract.ts";
interface Metric { count: number; totalMs: number; maxMs: number; lastMs: number; slowCount: number }
type PublicMethod = (...args: never[]) => unknown;
export interface InitContext extends CitationSharedState {
  _initializationTasks: Map<string, Promise<unknown>>; _activeRefreshTasks: Set<Promise<unknown>>;
  _refreshStateBySession: WeakMap<object, unknown>; _sessionUpdateQueue: Record<string, unknown>;
  _emptyReadCountBySession: Record<string, number>; _refreshRetryTimerBySession: Record<string, number>;
  _missingSessionCountBySession: Record<string, number>; _docIdBySession: Record<string, string>;
  _pendingCollectionNumber: number; activeSessionID: string | null; _lastRefreshAt: Record<string, number>;
  _minRefreshInterval: number; _errors: {message:string;time:number}[]; _debugCounters: Record<string, number>;
  _perfStats: Record<string, Metric>; _debugEnabled: boolean; _citationTagName: string;
  _citationTagsEnabled: boolean; _collectionsEnabled: boolean; _lastTagSyncSig: Record<string, string>;
  _sessionCitedIDs: Record<string, number[]>; _managedCitationTagIDs: Record<string, boolean>;
  _managedCitationTagNames: Record<string, string>; _temporaryCollectionKeys: Set<string>; _managedSearchKeys: Set<string>;
  _tagSyncInFlightBySession: Record<string, Promise<unknown>>; _pendingTagSyncIDsBySession: Record<string, number[]>;
  _tagSyncTimerBySession: Record<string, number>; _execCommandBindings: Map<unknown, unknown>; _execCommandSerial: number;
  _collectionRenameRetryTimerBySession: Record<string, number>; _collectionRenameRetryCountBySession: Record<string, number>;
  _lastRefreshFingerprintBySession?: WeakMap<object, string>; _lastSyncFailedBySession?: WeakMap<object, boolean>;
  _pendingItemsViewRefreshIDs?: Set<number> | "full" | null; _listenerBaseInterval?: number; _isListenerBackedOff?: boolean;
  _activityEpoch?: number; _idleTickCount?: number; _lastBgWindowProbeAt?: number; _scheduleListenerTick?: ((delay: number) => void) | null;
  _originalExecCommand: PublicMethod | null | undefined; _execCommandWrapper: PublicMethod | null | undefined;
  _isExecCommandHooked: boolean; _isExecCommandRunning: boolean; _execCommandDepth: number;
  _tagSyncDebounceMs: number; _itemsViewRefreshDebounceMs: number; _healthWindowMs: number;
  _perfSlowThresholdMs: number; _listenerTimer: number | null; _listenerStopped: boolean;
  debugLog(...args: unknown[]): void;
  _getBoolPref(key: string, fallback: boolean): boolean; _getCitationTagName(): string;
  _loadManagedTagState(): { ids: Record<string, boolean>; names: Record<string, string> };
  _loadKeySet(key: string): Set<string>; _getClampedIntPref(key: string, fallback: number, min: number, max: number): number;
  updateCitations: PublicMethod; refreshSessionCitations: PublicMethod; getSortedItemIDs: PublicMethod;
  syncCitationTags: PublicMethod; scheduleCitationTagSync: PublicMethod; getDiagnostics: PublicMethod;
  getDebugStats: PublicMethod; resetDebugStats: PublicMethod; assertHealth: PublicMethod; getHealthSummary: PublicMethod;
  runHealthCheck: PublicMethod; runHealthSummaryCheck: PublicMethod; getPerformanceStats: PublicMethod;
  resetPerformanceStats: PublicMethod; runPerformanceCheck: PublicMethod;
}
declare const addon: { data?: { citationDebugEnabled?: boolean } };
declare const runtime: { log(...args: unknown[]): void };
// ============================================================================
// Citation Subsystem Initialization
// ============================================================================

export class CitationInitializers {
  /**
   * Initializes session collections, queue maps, and revision trackers.
   * @private
   */
  _initSessionTracking(this: InitContext): void {
    this.sessions = {};
    this._initializationTasks = new Map();
    this._activeRefreshTasks = new Set();
    this._refreshStateBySession = new WeakMap();
    this._sessionUpdateQueue = {};
    this._sessionUpdateRevision = {};
    this._emptyReadCountBySession = {};
    this._refreshRetryTimerBySession = {};
    this._missingSessionCountBySession = {};
    this._docIdBySession = {};
    this._pendingCollectionNames = new Map();
    this._pendingCollectionNumber = 0;
    this.activeSessionID = null;
    this._sortedCacheBySession = {};
    this._lastRefreshAt = {};
    this._minRefreshInterval = 500;
    this._lastRefreshFingerprintBySession = new WeakMap();
    this._lastSyncFailedBySession = new WeakMap();
    this._pendingItemsViewRefreshIDs = null;
    this._listenerBaseInterval = 1000;
    this._isListenerBackedOff = false;
    this._activityEpoch = 0;
    this._idleTickCount = 0;
    this._lastBgWindowProbeAt = 0;
    this._scheduleListenerTick = null;
  }

  /**
   * Initializes diagnostic error buffers and performance metric trackers.
   * @private
   */
  _initDiagnosticsAndTelemetry(this: InitContext): void {
    this._errors = [];
    this._debugCounters = {
      listenerStarted: 0,
      execHookInstalled: 0,
      execHookRestored: 0,
      execCommandCalls: 0,
      syncCitationTagsRuns: 0,
      syncCitationTagsTouched: 0,
      syncCitationTagsFailures: 0
    };
    this._perfStats = {
      getSortedItemIDs: { count: 0, totalMs: 0, maxMs: 0, lastMs: 0, slowCount: 0 },
      refreshSessionCitations: { count: 0, totalMs: 0, maxMs: 0, lastMs: 0, slowCount: 0 },
      syncCitationTags: { count: 0, totalMs: 0, maxMs: 0, lastMs: 0, slowCount: 0 }
    };
  }

  /**
   * Binds public coordinator API onto Zotero.ZoteroCitation.api if present.
   * @private
   */
  _bindPublicApi(this: InitContext): void {
    const api = (Zotero as unknown as { ZoteroCitation?: { api?: Record<string, unknown> } }).ZoteroCitation?.api;
    if (api) {
      api.sessionRevision = 0;
      api.sessions = this.sessions;
      api.updateCitations = this.updateCitations.bind(this);
      api.refreshSessionCitations = this.refreshSessionCitations.bind(this);
      api.getSortedItemIDs = this.getSortedItemIDs.bind(this);
      api.syncCitationTags = this.syncCitationTags.bind(this);
      api.scheduleCitationTagSync = this.scheduleCitationTagSync.bind(this);
      api.getDiagnostics = this.getDiagnostics.bind(this);
      api.getDebugStats = this.getDebugStats.bind(this);
      api.resetDebugStats = this.resetDebugStats.bind(this);
      api.assertHealth = this.assertHealth.bind(this);
      api.getHealthSummary = this.getHealthSummary.bind(this);
      api.runHealthCheck = this.runHealthCheck.bind(this);
      api.runHealthSummaryCheck = this.runHealthSummaryCheck.bind(this);
      api.getPerformanceStats = this.getPerformanceStats.bind(this);
      api.resetPerformanceStats = this.resetPerformanceStats.bind(this);
      api.runPerformanceCheck = this.runPerformanceCheck.bind(this);
    }
  }

  /**
   * Loads persisted preferences and state for tags and temporary collections.
   * @private
   */
  _initPreferencesAndConfig(this: InitContext): void {
    this._debugEnabled = this._getBoolPref("extensions.zotero.zoterocitation.debug", false);
    try {
      if (typeof addon !== "undefined" && addon.data) addon.data.citationDebugEnabled = this._debugEnabled;
    } catch {}

    this._citationTagName = this._getCitationTagName();
    this._citationTagsEnabled = Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.enable", true) !== false;
    this._collectionsEnabled = Zotero.Prefs.get("extensions.zotero.zoterocitation.collections.enable", true) !== false;
    this._lastTagSyncSig = {};
    this._sessionCitedIDs = {};

    const managedTags = this._loadManagedTagState();
    this._managedCitationTagIDs = managedTags.ids;
    this._managedCitationTagNames = managedTags.names;
    this._temporaryCollectionKeys = this._loadKeySet(TEMP_COLLECTION_KEYS_PREF);
    this._managedSearchKeys = this._loadKeySet(TEMP_SEARCH_KEYS_PREF);

    this._tagSyncInFlightBySession = {};
    this._pendingTagSyncIDsBySession = {};
    this._tagSyncTimerBySession = {};
  }

  /**
   * Initializes Word process interception bindings and rename state.
   * @private
   */
  _initWordIntegrationState(this: InitContext): void {
    this._execCommandBindings = new Map();
    this._execCommandSerial = 0;
    this._collectionRenameRetryTimerBySession = {};
    this._collectionRenameRetryCountBySession = {};
    this._originalExecCommand = null;
    this._execCommandWrapper = null;
    this._isExecCommandHooked = false;
    this._isExecCommandRunning = false;
    this._execCommandDepth = 0;
  }

  /**
   * Initializes timers, polling listeners, and debounce threshold settings.
   * @private
   */
  _initTimersAndDebounce(this: InitContext): void {
    this._tagSyncDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.citationTagDebounceMs", 150, 0, 2000);
    this._itemsViewRefreshDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.itemsViewRefreshDebounceMs", 120, 0, 2000);
    this._healthWindowMs = this._getClampedIntPref("extensions.zotero.zoterocitation.healthWindowMs", 300000, 10000, 3600000);
    this._perfSlowThresholdMs = this._getClampedIntPref("extensions.zotero.zoterocitation.perfSlowThresholdMs", 50, 5, 5000);

    this._listenerTimer = null;
    this._listenerStopped = false;

    this.debugLog = (...args: unknown[]) => {
      if (this._debugEnabled) runtime.log(...args);
    };
  }
}
