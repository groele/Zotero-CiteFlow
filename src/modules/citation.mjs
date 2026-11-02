import { config } from "../config.mjs";
import { getString } from "./locale.mjs";

// ============================================================================
// Section 1: Constants & Preference Keys
// ============================================================================

export const TEMP_COLLECTION_RELATION = "dc:relation";
export const TEMP_COLLECTION_MARKER = "https://github.com/groele/Zotero-CiteFlow#temporary-collection";
export const LEGACY_UPSTREAM_TEMP_COLLECTION_MARKER = "https://github.com/MuiseDestiny/zotero-citation#temporary-collection";

export const TEMP_COLLECTION_KEYS_PREF = "zotero-citation.temporaryCollectionKeys";
export const TEMP_SEARCH_KEYS_PREF = "zotero-citation.managedSearchKeys";
export const MANAGED_TAG_IDS_PREF = "zotero-citation.managedCitationTagIDs";
export const MANAGED_TAG_STATE_PREF = "zotero-citation.managedCitationTagState";

// ============================================================================
// Section 2: Class Definition & Subsystem Initialization
// ============================================================================

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

  /**
   * Initializes session collections, queue maps, and revision trackers.
   * @private
   */
  _initSessionTracking() {
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
  }

  /**
   * Initializes diagnostic error buffers and performance metric trackers.
   * @private
   */
  _initDiagnosticsAndTelemetry() {
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
  _bindPublicApi() {
    if (Zotero.ZoteroCitation?.api) {
      const api = Zotero.ZoteroCitation.api;
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
  _initPreferencesAndConfig() {
    this._debugEnabled = this._getBoolPref("extensions.zotero.zoterocitation.debug", false);
    try {
      if (globalThis.addon?.data) addon.data.citationDebugEnabled = this._debugEnabled;
    } catch {}

    this._citationTagName = this._getCitationTagName();
    this._citationTagsEnabled = Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.enable", true) !== false;
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
  _initWordIntegrationState() {
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
  _initTimersAndDebounce() {
    this._tagSyncDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.citationTagDebounceMs", 150, 0, 2000);
    this._itemsViewRefreshDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.itemsViewRefreshDebounceMs", 120, 0, 2000);
    this._healthWindowMs = this._getClampedIntPref("extensions.zotero.zoterocitation.healthWindowMs", 300000, 10000, 3600000);
    this._perfSlowThresholdMs = this._getClampedIntPref("extensions.zotero.zoterocitation.perfSlowThresholdMs", 50, 5, 5000);

    this._listenerTimer = null;
    this._listenerStopped = false;

    this.debugLog = (...args) => {
      if (this._debugEnabled) runtime.log(...args);
    };
  }

  // ============================================================================
  // Section 3: Telemetry, Metrics & Health Diagnostics
  // ============================================================================

  /**
   * Records an error message and optional cause into bounded diagnostic error history.
   * @param {string} message - Descriptive error message
   * @param {Error} [cause] - Underlying exception
   */
  logError(message, cause) {
    const error = new Error(message, cause ? { cause } : undefined);
    (this._errors ??= []).push({ message, time: Date.now() });
    if (this._errors.length > 20) this._errors.shift();
    try {
      Zotero.logError(error);
    } catch {
      runtime?.log?.(message);
    }
  }

  /**
   * Increments a debug telemetry counter by delta.
   * @param {string} key - Counter metric key
   * @param {number} [delta=1] - Increment step
   * @private
   */
  _bumpDebugCounter(key, delta = 1) {
    this._debugCounters ??= {};
    if (!(key in this._debugCounters)) this._debugCounters[key] = 0;
    this._debugCounters[key] += delta;
  }

  /**
   * Records execution duration for a named performance metric.
   * @param {string} name - Metric name
   * @param {number} durationMs - Duration in milliseconds
   * @private
   */
  _recordPerf(name, durationMs) {
    this._perfStats ??= {};
    const metric = this._perfStats[name];
    if (!metric || !Number.isFinite(durationMs) || durationMs < 0) return;
    metric.count += 1;
    metric.totalMs += durationMs;
    metric.lastMs = durationMs;
    if (durationMs > metric.maxMs) metric.maxMs = durationMs;
    if (durationMs >= (this._perfSlowThresholdMs || 50)) metric.slowCount += 1;
  }

  /**
   * Returns a comprehensive diagnostic snapshot of CiteFlow subsystems.
   * @returns {object} Diagnostic snapshot
   */
  getDiagnostics() {
    return {
      activeSessions: Object.keys(this.sessions || {}).length,
      listenerStopped: !!this._listenerStopped,
      pendingInitializations: this._initializationTasks?.size || 0,
      pendingRefreshes: this._activeRefreshTasks?.size || 0,
      pendingUpdates: Object.keys(this._sessionUpdateQueue || {}).length,
      pendingTagSync: !!this._tagSyncQueue,
      errors: [...(this._errors || [])],
      performance: this.getPerformanceStats()
    };
  }

  /**
   * Returns internal debug statistics, counters, and execution states.
   * @returns {object} Debug statistics
   */
  getDebugStats() {
    const healthWindow = this._healthWindowMs || 300000;
    return {
      counters: { ...(this._debugCounters || {}) },
      recent: {
        errorCount: (this._errors || []).filter(e => e.time >= Date.now() - healthWindow).length
      },
      states: {
        debugEnabled: !!this._debugEnabled,
        listenerStopped: !!this._listenerStopped,
        isExecCommandHooked: !!this._isExecCommandHooked,
        isExecCommandRunning: !!this._isExecCommandRunning,
        activeSessionCount: Object.keys(this.sessions || {}).length
      },
      config: {
        tagSyncDebounceMs: this._tagSyncDebounceMs,
        itemsViewRefreshDebounceMs: this._itemsViewRefreshDebounceMs,
        healthWindowMs: this._healthWindowMs
      }
    };
  }

  /**
   * Resets all debug counters and error history.
   * @returns {object} Clean debug statistics
   */
  resetDebugStats() {
    for (const key in this._debugCounters || {}) this._debugCounters[key] = 0;
    this._errors = [];
    return this.getDebugStats();
  }

  /**
   * Asserts system health status and returns error/warning issues.
   * @returns {{ status: "ok"|"warn"|"error", errors: string[], warnings: string[], issues: string[], stats: object }}
   */
  assertHealth() {
    const stats = this.getDebugStats();
    const errors = [];
    const warnings = [];
    if (!stats.states.listenerStopped && !stats.states.isExecCommandHooked) {
      errors.push("Word integration wrapper is unavailable");
    }
    if (stats.recent.errorCount) {
      warnings.push(`${stats.recent.errorCount} operations reported an error in the health window`);
    }
    return {
      status: errors.length ? "error" : warnings.length ? "warn" : "ok",
      errors,
      warnings,
      issues: [...errors, ...warnings],
      stats
    };
  }

  /**
   * Returns a high-level summary of health signals and last operation counts.
   * @returns {object} Health summary
   */
  getHealthSummary() {
    const health = this.assertHealth();
    const { stats, status, errors, warnings } = health;
    const counters = stats?.counters || {};
    const recent = stats?.recent || {};
    const states = stats?.states || {};
    return {
      status,
      checkedAt: Date.now(),
      keySignals: {
        listenerStopped: !!states.listenerStopped,
        isExecCommandHooked: !!states.isExecCommandHooked,
        isExecCommandRunning: !!states.isExecCommandRunning,
        activeSessionCount: Number(states.activeSessionCount || 0),
        recentErrorCount: Number(recent.errorCount || 0),
        syncCitationTagsFailures: Number(counters.syncCitationTagsFailures || 0)
      },
      headline: {
        errors: errors.length,
        warnings: warnings.length,
        lastOps: {
          syncCitationTagsRuns: Number(counters.syncCitationTagsRuns || 0),
          syncCitationTagsTouched: Number(counters.syncCitationTagsTouched || 0)
        }
      }
    };
  }

  /**
   * Runs an asynchronous health summary check with optional reset and delay.
   * @param {{ reset?: boolean, waitMs?: number }} [options]
   * @returns {Promise<object>}
   */
  async runHealthSummaryCheck(options = {}) {
    const { reset = false, waitMs = 0 } = options || {};
    if (reset) this.resetDebugStats();
    const safeWaitMs = Number.isFinite(Number(waitMs)) ? Math.max(0, Math.min(600000, Math.trunc(Number(waitMs)))) : 0;
    if (safeWaitMs > 0) await Zotero.Promise.delay(safeWaitMs);
    return { ...this.getHealthSummary(), meta: { resetPerformed: !!reset, waitedMs: safeWaitMs } };
  }

  /**
   * Runs an asynchronous full health check with optional reset and delay.
   * @param {{ reset?: boolean, waitMs?: number }} [options]
   * @returns {Promise<object>}
   */
  async runHealthCheck(options = {}) {
    const { reset = true, waitMs = 0 } = options || {};
    if (reset) this.resetDebugStats();
    const safeWaitMs = Number.isFinite(Number(waitMs)) ? Math.max(0, Math.min(600000, Math.trunc(Number(waitMs)))) : 0;
    if (safeWaitMs > 0) await Zotero.Promise.delay(safeWaitMs);
    const result = this.assertHealth();
    return { ...result, meta: { resetPerformed: !!reset, waitedMs: safeWaitMs, checkedAt: Date.now() } };
  }

  /**
   * Returns latency and frequency metrics for performance-critical operations.
   * @returns {object} Performance statistics
   */
  getPerformanceStats() {
    const result = {};
    for (const key in this._perfStats || {}) {
      const metric = this._perfStats[key];
      result[key] = {
        ...metric,
        avgMs: metric.count > 0 ? metric.totalMs / metric.count : 0
      };
    }
    return {
      metrics: result,
      config: {
        perfSlowThresholdMs: this._perfSlowThresholdMs
      },
      checkedAt: Date.now()
    };
  }

  /**
   * Resets all performance metric accumulators.
   * @returns {object} Reset performance statistics
   */
  resetPerformanceStats() {
    for (const key in this._perfStats || {}) {
      this._perfStats[key] = { count: 0, totalMs: 0, maxMs: 0, lastMs: 0, slowCount: 0 };
    }
    return this.getPerformanceStats();
  }

  /**
   * Runs an asynchronous performance measurement check.
   * @param {{ reset?: boolean, waitMs?: number }} [options]
   * @returns {Promise<object>}
   */
  async runPerformanceCheck(options = {}) {
    const { reset = false, waitMs = 0 } = options || {};
    if (reset) this.resetPerformanceStats();
    const safeWaitMs = Number.isFinite(Number(waitMs)) ? Math.max(0, Math.min(600000, Math.trunc(Number(waitMs)))) : 0;
    if (safeWaitMs > 0) await Zotero.Promise.delay(safeWaitMs);
    return { ...this.getPerformanceStats(), meta: { resetPerformed: !!reset, waitedMs: safeWaitMs } };
  }

  // ============================================================================
  // Section 4: Configuration & State Serialization
  // ============================================================================

  /**
   * Reads a boolean preference from Zotero.Prefs safely.
   * @param {string} key - Preference key
   * @param {boolean} fallback - Default fallback value
   * @returns {boolean}
   * @private
   */
  _getBoolPref(key, fallback) {
    try {
      const value = Zotero.Prefs.get(key, true);
      return typeof value === "boolean" ? value : fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Reads an integer preference clamped between min and max bounds.
   * @param {string} key - Preference key
   * @param {number} fallback - Default fallback value
   * @param {number} min - Minimum allowed value
   * @param {number} max - Maximum allowed value
   * @returns {number}
   * @private
   */
  _getClampedIntPref(key, fallback, min, max) {
    try {
      const raw = Zotero.Prefs.get(key, true);
      if ((typeof raw !== "number" && typeof raw !== "string") || (typeof raw === "string" && !raw.trim())) return fallback;
      const value = Number(raw);
      if (!Number.isFinite(value)) return fallback;
      return Math.max(min, Math.min(max, Math.trunc(value)));
    } catch {
      return fallback;
    }
  }

  /**
   * Validates and returns the configured citation tag name string.
   * @returns {string} Tag name (defaults to "/Citations")
   * @private
   */
  _getCitationTagName() {
    const name = Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.text", true);
    return typeof name === "string" && name.trim() && name.trim().length <= 200 && !/[\x00-\x1f\x7f]/.test(name)
      ? name.trim() : "/Citations";
  }

  /**
   * Applies updated preferences and triggers dynamic tag synchronization if tag settings changed.
   * @returns {Promise<object>|undefined}
   */
  applyPreferences() {
    const tagsEnabled = Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.enable", true) !== false;
    const tagsChanged = this._citationTagsEnabled !== undefined && this._citationTagsEnabled !== tagsEnabled;
    const tagName = this._getCitationTagName();
    const tagRenamed = this._citationTagName !== undefined && this._citationTagName !== tagName;

    this._citationTagsEnabled = tagsEnabled;
    this._citationTagName = tagName;
    this._debugEnabled = this._getBoolPref("extensions.zotero.zoterocitation.debug", false);
    if (globalThis.addon?.data) addon.data.citationDebugEnabled = this._debugEnabled;

    this._tagSyncDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.citationTagDebounceMs", 150, 0, 2000);
    this._itemsViewRefreshDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.itemsViewRefreshDebounceMs", 120, 0, 2000);
    this._healthWindowMs = this._getClampedIntPref("extensions.zotero.zoterocitation.healthWindowMs", 300000, 10000, 3600000);
    this._perfSlowThresholdMs = this._getClampedIntPref("extensions.zotero.zoterocitation.perfSlowThresholdMs", 50, 5, 5000);

    if (tagsChanged || tagRenamed || this._tagPreferencesNeedSync) {
      this._lastTagSyncSig = {};
      this._tagPreferencesNeedSync = true;
      return this.syncCitationTags("__preferences__", []).then(result => {
        this._tagPreferencesNeedSync = result?.complete === false;
        return result;
      });
    }
  }

  /**
   * Loads a JSON set of string keys from a preference.
   * @param {string} prefKey - Preference key
   * @returns {Set<string>}
   * @private
   */
  _loadKeySet(prefKey) {
    try {
      let raw = Zotero.Prefs.get(prefKey);
      if (!raw) {
        const legacyRaw = Zotero.Prefs.get(prefKey, true);
        if (legacyRaw) {
          raw = legacyRaw;
          Zotero.Prefs.set(prefKey, legacyRaw);
        }
      }
      const values = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(values) ? values.filter(v => typeof v === "string" && v) : []);
    } catch {
      return new Set();
    }
  }

  /**
   * Saves a Set of string keys to a preference as a JSON array.
   * @param {string} prefKey - Preference key
   * @param {Set<string>} values - Values to persist
   * @private
   */
  _saveKeySet(prefKey, values) {
    try {
      Zotero.Prefs.set(prefKey, JSON.stringify([...values]));
    } catch (error) {
      this.logError(`Failed to save preference ${prefKey}`, error);
    }
  }

  /**
   * Loads managed citation tag state with version-1 format and legacy array migration.
   * @returns {{ ids: object, names: object }}
   * @private
   */
  _loadManagedTagState() {
    let raw;
    try {
      raw = Zotero.Prefs.get(MANAGED_TAG_STATE_PREF);
      const state = raw && JSON.parse(raw);
      if (state?.version === 1 && state.tags && typeof state.tags === "object" && !Array.isArray(state.tags)) {
        const entries = Object.entries(state.tags).filter(([id, name]) =>
          Number.isSafeInteger(Number(id)) && Number(id) > 0
          && typeof name === "string" && name.trim() && name.length <= 200 && !/[\x00-\x1f\x7f]/.test(name));
        return {
          ids: Object.fromEntries(entries.map(([id]) => [id, true])),
          names: Object.fromEntries(entries)
        };
      }
      if (raw) throw new Error("Unsupported managed citation tag state");
    } catch (error) {
      this.logError("Failed to read managed citation tag state", error);
    }

    if (raw) return { ids: {}, names: {} };

    try {
      let rawKeys = Zotero.Prefs.get(MANAGED_TAG_IDS_PREF);
      if (!rawKeys) {
        const legacyRaw = Zotero.Prefs.get(MANAGED_TAG_IDS_PREF, true);
        if (legacyRaw) rawKeys = legacyRaw;
      }
      const keys = rawKeys ? JSON.parse(rawKeys) : [];
      const validKeys = Array.isArray(keys) ? keys.filter(k => typeof k === "string" && k) : [];
      return {
        ids: Object.fromEntries(validKeys.map(k => [k, true])),
        names: Object.fromEntries(validKeys.map(k => [k, "/Citations"]))
      };
    } catch {
      return { ids: {}, names: {} };
    }
  }

  /**
   * Persists currently managed citation tag IDs and names to preferences.
   * @returns {boolean} True if write succeeded
   * @private
   */
  _saveManagedTagIDs() {
    try {
      const tags = Object.fromEntries(
        Object.keys(this._managedCitationTagIDs || {}).map(id => [id, this._managedCitationTagNames?.[id] || "/Citations"])
      );
      Zotero.Prefs.set(MANAGED_TAG_STATE_PREF, JSON.stringify({ version: 1, tags }));
      Zotero.Prefs.set(MANAGED_TAG_IDS_PREF, JSON.stringify(Object.keys(this._managedCitationTagIDs || {})));
      return true;
    } catch (error) {
      this.logError("Failed to save managed citation tag state", error);
      return false;
    }
  }

  // ============================================================================
  // Section 5: Document Name Sanitization & Formatting
  // ============================================================================

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

  // ============================================================================
  // Section 6: Temporary Collection Lifecycle & Cleanup
  // ============================================================================

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

  /**
   * Purges orphan temporary collections and legacy searches without modifying user collections.
   * @returns {Promise<void>}
   */
  async clearStaleArtifacts() {
    const libraryID = Zotero.Libraries.userLibraryID;
    const collections = Zotero.Collections.getByLibrary(libraryID, true, true);
    const collectionsByKey = new Map(collections.map(c => [c.key, c]));
    const removedKeys = new Set();
    const remainingKeys = new Set();

    for (const key of this._temporaryCollectionKeys || []) {
      const collection = collectionsByKey.get(key);
      if (!collection) continue;
      try {
        await collection.eraseTx();
        removedKeys.add(key);
      } catch (error) {
        remainingKeys.add(key);
        this.logError("Failed to remove a stale citation collection", error);
      }
    }

    for (const collection of collections) {
      if (removedKeys.has(collection.key)) continue;
      try {
        await collection.loadDataType("relations");
        const relations = collection.getRelationsByPredicate(TEMP_COLLECTION_RELATION) || [];
        if (relations.includes(TEMP_COLLECTION_MARKER) || relations.includes(LEGACY_UPSTREAM_TEMP_COLLECTION_MARKER)) {
          await collection.eraseTx();
        }
      } catch (error) {
        this.logError("Failed to remove a stale citation collection", error);
      }
    }

    this._temporaryCollectionKeys = remainingKeys;
    this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);

    if (!this._managedSearchKeys?.size) return;
    const searchesByKey = new Map(Zotero.Searches.getByLibrary(libraryID).map(s => [s.key, s]));
    for (const key of [...this._managedSearchKeys]) {
      const search = searchesByKey.get(key);
      if (!search) {
        this._managedSearchKeys.delete(key);
        continue;
      }
      try {
        await search.eraseTx();
        this._managedSearchKeys.delete(key);
      } catch (error) {
        this.logError("Failed to remove a legacy citation search", error);
      }
    }
    this._saveKeySet(TEMP_SEARCH_KEYS_PREF, this._managedSearchKeys);
  }

  /**
   * Initializes a temporary Word citation collection in the user library.
   * @param {string} sessionID - Session identifier
   * @param {object} [session] - Internal session object
   * @returns {Promise<void>}
   */
  async initCollection(sessionID, session = this.sessions[sessionID]) {
    if (!session || this._listenerStopped) return;
    const collection = new Zotero.Collection();
    collection.libraryID = Zotero.Libraries.userLibraryID;
    collection.name = this._getPendingCollectionName(sessionID);
    try {
      if (typeof collection.addRelation === "function") {
        collection.addRelation(TEMP_COLLECTION_RELATION, TEMP_COLLECTION_MARKER);
      }
    } catch (error) {
      this.logError("Failed to mark temporary Word citation collection", error);
    }
    await collection.saveTx({ skipSelect: true });
    this._temporaryCollectionKeys.add(collection.key);
    this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);
    if (this._listenerStopped || this.sessions[sessionID] !== session) {
      await collection.eraseTx();
      this._temporaryCollectionKeys.delete(collection.key);
      this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);
      return;
    }
    session.collection = collection;
    this._invalidateSessionIndex();
  }

  /**
   * Transactionally synchronizes item members in the session's temporary collection.
   * @param {object} session - Session object
   * @param {number[]} targetIDs - Target item IDs
   * @returns {Promise<void>}
   */
  async syncCollectionItems(session, targetIDs) {
    const collection = session?.collection;
    if (this._listenerStopped || session?.closing || !collection?.id) return;

    const normalizedTargetIDs = [...new Set(targetIDs.map(Number).filter(Number.isInteger))];
    const currentIDs = collection.getChildItems(true)
      .map(itemOrID => typeof itemOrID === "number" ? itemOrID : itemOrID?.id)
      .filter(Number.isInteger);

    const targetSet = new Set(normalizedTargetIDs);
    const currentSet = new Set(currentIDs);
    const remove = currentIDs.filter(id => !targetSet.has(id));
    const add = normalizedTargetIDs.filter(id => !currentSet.has(id));

    if (!remove.length && !add.length) return;

    await Zotero.DB.executeTransaction(async () => {
      if (this._listenerStopped || session.closing) return;
      if (remove.length) await collection.removeItems(remove);
      if (add.length) await collection.addItems(add);
    });
  }

  // ============================================================================
  // Section 7: Word Process Hooks & Integration Engine
  // ============================================================================

  /**
   * Associates a session with a document ID and clears obsolete rename timers.
   * @param {string} sessionID - Session identifier
   * @param {string} docId - Document path or URI
   * @private
   */
  _rememberSessionDocument(sessionID, docId) {
    if (typeof sessionID !== "string" || !sessionID || !docId) return;
    if (this._docIdBySession[sessionID] && this._docIdBySession[sessionID] !== docId) {
      this._clearCollectionRenameRetry(sessionID);
    }
    this._docIdBySession[sessionID] = docId;
    const session = this.sessions?.[sessionID];
    if (session) session.docId = docId;
  }

  /**
   * Clears collection rename retry timers and counters for a session.
   * @param {string} sessionID - Session identifier
   * @private
   */
  _clearCollectionRenameRetry(sessionID) {
    const timer = this._collectionRenameRetryTimerBySession?.[sessionID];
    if (timer) {
      globalThis.clearTimeout(timer);
      delete this._collectionRenameRetryTimerBySession[sessionID];
    }
    if (this._collectionRenameRetryCountBySession) {
      delete this._collectionRenameRetryCountBySession[sessionID];
    }
  }

  /**
   * Schedules an exponential retry for collection renaming.
   * @param {string} sessionID - Session identifier
   * @param {string} targetName - Target collection name
   * @param {string} [docId] - Expected document identifier
   * @private
   */
  _scheduleCollectionRenameRetry(sessionID, targetName, docId = this._docIdBySession?.[sessionID]) {
    if (this._listenerStopped || !sessionID || !targetName || this._collectionRenameRetryTimerBySession?.[sessionID]) return;
    const attempt = (this._collectionRenameRetryCountBySession[sessionID] || 0) + 1;
    if (attempt > 2) {
      this.debugLog("[Citation execCommand] collection rename retries exhausted", sessionID);
      return;
    }
    this._collectionRenameRetryCountBySession[sessionID] = attempt;
    this._collectionRenameRetryTimerBySession[sessionID] = globalThis.setTimeout(() => {
      delete this._collectionRenameRetryTimerBySession[sessionID];
      const session = this.sessions?.[sessionID];
      if (this._listenerStopped || !session?.collection || (docId && this._docIdBySession?.[sessionID] !== docId)) return;
      this._renameCollection(sessionID, targetName, docId).catch(error => {
        this.logError(`Failed to retry Word citation collection rename for ${sessionID}`, error);
        this._scheduleCollectionRenameRetry(sessionID, targetName, docId);
      });
    }, 100 * attempt);
  }

  /**
   * Renames a temporary collection with serialized queuing and rollback on failure.
   * @param {string} sessionID - Session identifier
   * @param {string} targetName - New collection name
   * @param {string} [docId] - Expected document ID
   * @returns {Promise<void>}
   * @private
   */
  async _renameCollection(sessionID, targetName, docId) {
    const session = this.sessions?.[sessionID];
    if (!session) return;
    const task = (session._renameTask || Promise.resolve()).catch(() => {}).then(async () => {
      if (this._listenerStopped || session.closing || this.sessions?.[sessionID] !== session
        || (docId && this._docIdBySession[sessionID] !== docId) || !session.collection) return;
      const previousName = session.collection.name;
      if (previousName === targetName) return;
      session.collection.name = targetName;
      try {
        await session.collection.saveTx({ skipSelect: true });
        session.lastName = targetName;
      } catch (error) {
        session.collection.name = previousName;
        throw error;
      }
    });
    session._renameTask = task;
    try {
      await task;
    } finally {
      if (session._renameTask === task) session._renameTask = null;
    }
  }

  /**
   * Background polling loop that periodically synchronizes active Word sessions.
   * @param {number} t - Polling interval in milliseconds
   * @returns {Promise<void>}
   */
  async listener(t) {
    try {
      await this.clearStaleArtifacts();
    } catch (error) {
      this.logError("Failed to clear stale citation artifacts", error);
    }
    if (this._listenerStopped) return;
    this._bumpDebugCounter("listenerStarted");
    this.debugLog("[Citation debug] listener started", this._debugCounters);

    if (this._listenerTimer) {
      globalThis.clearTimeout(this._listenerTimer);
      this._listenerTimer = null;
    }

    const tick = async () => {
      if (this._listenerStopped) return;
      try {
        if (!Zotero.ZoteroCitation) {
          void this.clear().catch(error => this.logError("Failed to clear after plugin instance removal", error));
          return;
        }
        if (this._isExecCommandRunning) return;

        const sessions = Zotero.Integration.sessions || {};
        for (const sessionID in this.sessions) {
          if (!(sessionID in sessions)) {
            const missingCount = (this._missingSessionCountBySession[sessionID] || 0) + 1;
            this._missingSessionCountBySession[sessionID] = missingCount;
            if (missingCount >= 3) {
              this.debugLog("[Citation] Session absent for three checks, cleaning up:", sessionID);
              await this.clearSession(sessionID);
            }
          } else {
            delete this._missingSessionCountBySession[sessionID];
          }
        }

        for (const sessionID in sessions) {
          const session = sessions[sessionID];
          if (!/(WinWord|MacWord|Word)/i.test(String(session?.agent || ""))) continue;
          try {
            const tracked = await this.ensureSession(sessionID, session);
            if (!tracked || tracked.pending || !tracked.collection || this._listenerStopped) continue;
          } catch (error) {
            this.logError("Cannot initialize a Word citation collection", error);
            continue;
          }
          await this.refreshSessionCitations(sessionID, session);
        }
      } catch (e) {
        this.logError("Background citation synchronization failed", e);
      } finally {
        if (!this._listenerStopped) {
          this._listenerTimer = globalThis.setTimeout(
            () => { this._listenerTickTask = tick(); },
            Object.keys(this.sessions).length ? t : Math.max(t, 5000)
          );
        }
      }
    };

    this._listenerTimer = globalThis.setTimeout(tick, t);
    this._installWordIntegrationHooks();
  }

  /**
   * Installs interception wrappers on Zotero.Integration.execCommand and getSession.
   * @private
   */
  _installWordIntegrationHooks() {
    if (this._isExecCommandHooked) return;
    this._originalExecCommand = Zotero.Integration.execCommand;
    if (typeof this._originalExecCommand !== "function") {
      this.logError("Word integration command API is unavailable");
      return;
    }
    this._isExecCommandHooked = true;
    this._bumpDebugCounter("execHookInstalled");

    const citationModule = this;
    const originalExecCommand = this._originalExecCommand;
    const originalGetSession = Zotero.Integration.getSession;

    if (typeof originalGetSession === "function") {
      const getSessionWrapper = async function(app, doc, agent, command) {
        const candidates = [...citationModule._execCommandBindings.values()]
          .filter(binding => binding.agent === agent && binding.command === command);
        const binding = candidates.length === 1 ? candidates[0] : null;
        const result = await originalGetSession.apply(this, arguments);
        if (!citationModule._listenerStopped && binding && !binding.ambiguous
          && citationModule._execCommandBindings.get(binding.bindingID) === binding) {
          const sessionID = result?.[0]?.sessionID;
          if (typeof sessionID === "string" && sessionID) binding.sessionID = sessionID;
        }
        return result;
      };
      this._originalGetSession = originalGetSession;
      this._getSessionWrapper = getSessionWrapper;
      Zotero.Integration.getSession = getSessionWrapper;
    }

    const execCommandWrapper = async function(agent, command, docId) {
      if (citationModule._listenerStopped || !/(WinWord|MacWord|Word)/i.test(String(agent || ""))) {
        return originalExecCommand.apply(this, arguments);
      }
      citationModule._bumpDebugCounter("execCommandCalls");
      citationModule.debugLog("[Citation execCommand]", agent, command, docId);

      const integration = Zotero.Integration;
      const sessionsBefore = new Set(Object.keys(integration?.sessions || {}));
      const currentBefore = integration?.currentSession;
      const boundBefore = typeof currentBefore?.sessionID === "string" ? currentBefore.sessionID : null;
      const bindingID = ++citationModule._execCommandSerial;
      const binding = { bindingID, sessionID: null, docId, sessionsBefore, agent, command, ambiguous: false };

      for (const pending of citationModule._execCommandBindings.values()) {
        pending.ambiguous = binding.ambiguous = true;
      }
      citationModule._execCommandBindings.set(bindingID, binding);
      citationModule._execCommandDepth += 1;
      citationModule._isExecCommandRunning = true;

      let result;
      try {
        result = await originalExecCommand.apply(this, arguments);
      } catch (error) {
        citationModule._execCommandBindings.delete(bindingID);
        throw error;
      } finally {
        citationModule._execCommandDepth = Math.max(0, citationModule._execCommandDepth - 1);
        citationModule._isExecCommandRunning = citationModule._execCommandDepth > 0;
      }

      try {
        if (citationModule._listenerStopped || binding.ambiguous) return result;
        if (!binding.sessionID && typeof originalGetSession !== "function") {
          const currentAfter = integration?.currentSession;
          const currentAfterID = typeof currentAfter?.sessionID === "string" ? currentAfter.sessionID : null;
          const sessionsAfter = Object.keys(integration?.sessions || {});
          const pendingBindings = [...citationModule._execCommandBindings.values()]
            .filter(candidate => candidate.bindingID !== bindingID);
          if (currentAfterID && currentAfterID !== boundBefore && pendingBindings.length === 0
            && sessionsAfter.includes(currentAfterID)) {
            binding.sessionID = currentAfterID;
          }
        }

        const sessionID = binding.sessionID;
        if (!sessionID) {
          citationModule.debugLog("[Citation execCommand] session binding unavailable; skipping collection rename");
          return result;
        }

        const targetName = citationModule._getDocumentDisplayName(docId);
        if (targetName) {
          citationModule._rememberSessionDocument(sessionID, docId);
        } else if (docId) {
          citationModule._clearCollectionRenameRetry(sessionID);
          delete citationModule._docIdBySession[sessionID];
          if (citationModule.sessions?.[sessionID]) delete citationModule.sessions[sessionID].docId;
          delete addon.data.docId;
        }
        citationModule._setActiveSessionID(sessionID);
        if (targetName) addon.data.docId = docId;

        const _session = await citationModule.ensureSession(sessionID);
        if (!_session?.collection || citationModule._listenerStopped) return result;
        const nativeSession = integration.sessions?.[sessionID];
        if (nativeSession) await citationModule.refreshSessionCitations(sessionID, nativeSession);

        if (targetName && _session.collection.name !== targetName) {
          try {
            await citationModule._renameCollection(sessionID, targetName, docId);
          } catch (error) {
            citationModule.logError(`Failed to rename Word citation collection for ${sessionID}`, error);
            citationModule._scheduleCollectionRenameRetry(sessionID, targetName, docId);
          }
        }
      } catch (error) {
        citationModule.logError("Post-command citation refresh failed", error);
      } finally {
        citationModule._execCommandBindings.delete(bindingID);
      }
      return result;
    };

    this._execCommandWrapper = execCommandWrapper;
    Zotero.Integration.execCommand = execCommandWrapper;
  }

  /**
   * Ensures tracking state and temporary collection exist for a given Word session.
   * @param {string} sessionID - Word session identifier
   * @param {object} [nativeSession] - Zotero Integration native session
   * @returns {Promise<object|undefined>}
   */
  async ensureSession(sessionID, nativeSession = Zotero.Integration.sessions?.[sessionID]) {
    if (this._listenerStopped || !nativeSession) return;
    const existing = this.sessions[sessionID];
    if (existing?.closing) return;
    if (existing?.collection) return existing;
    this._initializationTasks ??= new Map();
    if (this._initializationTasks.has(sessionID)) return this._initializationTasks.get(sessionID);

    const session = existing || {
      idData: {},
      lastName: this._getPendingCollectionName(sessionID),
      docId: this._docIdBySession[sessionID],
      pending: true
    };
    this.sessions[sessionID] = session;
    this._invalidateSessionIndex();

    const task = (async () => {
      try {
        await this.initCollection(sessionID, session);
        return !this._listenerStopped && this.sessions[sessionID] === session ? session : undefined;
      } catch (error) {
        if (this.sessions[sessionID] === session) delete this.sessions[sessionID];
        this._invalidateSessionIndex();
        throw error;
      } finally {
        session.pending = false;
      }
    })();

    this._initializationTasks.set(sessionID, task);
    try {
      return await task;
    } finally {
      if (this._initializationTasks.get(sessionID) === task) this._initializationTasks.delete(sessionID);
    }
  }

  // ============================================================================
  // Section 8: Citation Sorting & Signature Cache
  // ============================================================================

  /**
   * Formats a cache key string for session item sort signatures.
   * @param {string} sessionID - Session identifier
   * @returns {string} Cache key
   * @private
   */
  _getSortedCacheKey(sessionID) {
    return `cache_${sessionID}`;
  }

  /**
   * Retrieves and validates cached sort signature and item IDs for a session.
   * @param {string} sessionID - Session identifier
   * @returns {object|undefined}
   * @private
   */
  _getSortedCache(sessionID) {
    if (!this._sortedCacheBySession || typeof this._sortedCacheBySession !== "object") return undefined;
    const key = this._getSortedCacheKey(sessionID);
    const cache = this._sortedCacheBySession[key];
    if (!cache || typeof cache.sig !== "string" || !Array.isArray(cache.result)
      || cache.result.some(id => !Number.isSafeInteger(id) || id <= 0)) {
      return undefined;
    }
    return cache;
  }

  /**
   * Caches sort signature and cloned result array for a session.
   * @param {string} sessionID - Session identifier
   * @param {string} sig - Signature hash string
   * @param {number[]} result - Sorted item IDs
   * @private
   */
  _setSortedCache(sessionID, sig, result) {
    if (!this._sortedCacheBySession || typeof this._sortedCacheBySession !== "object") {
      this._sortedCacheBySession = {};
    }
    const key = this._getSortedCacheKey(sessionID);
    this._sortedCacheBySession[key] = { sig, result: [...result] };
  }

  /**
   * Extracts and sorts item IDs according to their order of appearance in the Word document.
   * @param {object} citationsByIndex - Native citation index dictionary
   * @param {string} sessionID - Session identifier
   * @returns {number[]} Sorted unique item IDs
   */
  getSortedItemIDs(citationsByIndex, sessionID) {
    const perfStart = Date.now();
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
      const cache = this._getSortedCache(sessionID);
      if (cache?.sig === sig) return [...cache.result];

      this._setSortedCache(sessionID, sig, sortedItemIDs);
      this.debugLog("[Citation getSortedItemIDs] Session:", sessionID, "Items:", sortedItemIDs.length);
      return sortedItemIDs;
    } catch (e) {
      runtime?.log?.("[Citation] ERROR in getSortedItemIDs:", e);
      const cache = this._getSortedCache(sessionID);
      return cache?.result ? [...cache.result] : [];
    } finally {
      this._recordPerf("getSortedItemIDs", Date.now() - perfStart);
    }
  }

  /**
   * Resets and cleans up session-level caches, timers, and tracking records.
   * @param {string} sessionID - Session identifier
   * @param {boolean} [removeSession=true] - Whether to delete session from this.sessions
   */
  cleanupSessionState(sessionID, removeSession = true) {
    this._clearCollectionRenameRetry(sessionID);
    if (removeSession && this.sessions) {
      delete this.sessions[sessionID];
      this._invalidateSessionIndex();
    }
    delete this._docIdBySession[sessionID];
    if (this.activeSessionID === sessionID) this._setActiveSessionID(null);
    delete this._lastRefreshAt[sessionID];
    delete this._lastTagSyncSig[sessionID];
    delete this._sessionCitedIDs[sessionID];
    delete this._tagSyncInFlightBySession[sessionID];
    delete this._pendingTagSyncIDsBySession[sessionID];
    delete this._emptyReadCountBySession[sessionID];
    delete this._missingSessionCountBySession[sessionID];
    this._sessionUpdateRevision[sessionID] = (this._sessionUpdateRevision[sessionID] || 0) + 1;
    delete this._sessionUpdateQueue[sessionID];

    if (this._refreshRetryTimerBySession[sessionID]) {
      globalThis.clearTimeout(this._refreshRetryTimerBySession[sessionID]);
      delete this._refreshRetryTimerBySession[sessionID];
    }
    if (this._tagSyncTimerBySession[sessionID]) {
      globalThis.clearTimeout(this._tagSyncTimerBySession[sessionID]);
      delete this._tagSyncTimerBySession[sessionID];
    }
    const cacheKey = this._getSortedCacheKey(sessionID);
    delete this._sortedCacheBySession[cacheKey];
  }

  // ============================================================================
  // Section 9: Tag Governance & Read-Only Protection
  // ============================================================================

  /**
   * Constructs a deterministic signature from an array of item IDs.
   * @param {number[]} sortedItemIDs - Array of item IDs
   * @returns {string} Comma-separated signature
   * @private
   */
  _buildCitationTagSig(sortedItemIDs) {
    if (!Array.isArray(sortedItemIDs) || sortedItemIDs.length === 0) return "";
    const uniq = Array.from(new Set(
      sortedItemIDs.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)
    )).sort((a, b) => a - b);
    return uniq.join(",");
  }

  /**
   * Schedules a debounced tag synchronization for a given session.
   * @param {string} sessionID - Session identifier
   * @param {number[]} sortedItemIDs - Cited item IDs
   * @param {boolean} [force=false] - Force sync even if signature matches
   */
  scheduleCitationTagSync(sessionID, sortedItemIDs, force = false) {
    if (this._listenerStopped) return;
    const normalizedIDs = Array.isArray(sortedItemIDs)
      ? sortedItemIDs.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)
      : [];
    const sig = this._buildCitationTagSig(normalizedIDs);
    if (normalizedIDs.length) this._sessionCitedIDs[sessionID] = normalizedIDs;
    else delete this._sessionCitedIDs[sessionID];

    if (this._listenerStopped) return;
    if (!force && this._lastTagSyncSig[sessionID] === sig) return;

    this._lastTagSyncSig[sessionID] = sig;
    this._pendingTagSyncIDsBySession[sessionID] = normalizedIDs;
    if (this._tagSyncTimerBySession[sessionID]) return;

    this._tagSyncTimerBySession[sessionID] = globalThis.setTimeout(() => {
      delete this._tagSyncTimerBySession[sessionID];
      const pendingIDs = this._pendingTagSyncIDsBySession[sessionID];
      if (!pendingIDs || this._tagSyncInFlightBySession[sessionID]) return;
      delete this._pendingTagSyncIDsBySession[sessionID];

      const syncPromise = this.syncCitationTags(sessionID, pendingIDs);
      this._tagSyncInFlightBySession[sessionID] = syncPromise;
      void syncPromise.catch(e => {
        runtime?.log?.("[Citation scheduleCitationTagSync] Unexpected error:", e);
      }).finally(() => {
        if (this._tagSyncInFlightBySession[sessionID] === syncPromise) {
          delete this._tagSyncInFlightBySession[sessionID];
        }
        const nextPendingIDs = this._pendingTagSyncIDsBySession[sessionID];
        if (nextPendingIDs) {
          delete this._pendingTagSyncIDsBySession[sessionID];
          this.scheduleCitationTagSync(sessionID, nextPendingIDs, true);
        }
      });
    }, this._tagSyncDebounceMs);
  }

  /**
   * Validates whether an item belongs to the user library and is writable (Read-Only Guard).
   * @param {Zotero.Item} item - Zotero item
   * @returns {boolean} True if safe to write
   * @private
   */
  _isWritableCitationItem(item) {
    const userLibraryID = Zotero.Libraries?.userLibraryID;
    if (!item || item.libraryID !== userLibraryID || item.editable === false) {
      return false;
    }
    try {
      if (typeof item.isEditable === "function" && !item.isEditable()) return false;
      const library = typeof Zotero.Libraries?.get === "function" ? Zotero.Libraries.get(item.libraryID) : null;
      if (library?.editable === false || library?.readOnly === true) return false;
      if (typeof library?.isEditable === "function" && !library.isEditable()) return false;
      if (typeof library?.editable === "function" && !library.editable()) return false;
    } catch {
      return false;
    }
    return true;
  }

  /**
   * Serializes tag synchronization through a single sequential promise queue.
   * @param {string} sessionID - Session identifier
   * @param {number[]} sortedItemIDs - Cited item IDs
   * @returns {Promise<{ complete: boolean, touchedCount: number }>}
   */
  async syncCitationTags(sessionID, sortedItemIDs) {
    if (this._listenerStopped && sessionID !== "__shutdown__") return;
    const previous = this._tagSyncQueue || Promise.resolve();
    const task = previous.catch(() => {}).then(() => this._syncCitationTags(sessionID, sortedItemIDs));
    this._tagSyncQueue = task;
    try {
      return await task;
    } finally {
      if (this._tagSyncQueue === task) this._tagSyncQueue = null;
    }
  }

  /**
   * Synchronizes managed citation tags on user items with transactional rollback on save failures.
   * @param {string} sessionID - Session identifier
   * @param {number[]} sortedItemIDs - Cited item IDs
   * @returns {Promise<{ complete: boolean, touchedCount: number }>}
   * @private
   */
  async _syncCitationTags(sessionID, sortedItemIDs) {
    if (this._listenerStopped && sessionID !== "__shutdown__") return;
    const tagName = this._citationTagName;
    this._managedCitationTagNames ??= {};
    this._managedCitationTagIDs ??= {};
    const perfStart = Date.now();
    let touchedCount = 0;
    let lastYieldedTouchCount = 0;
    let hadFailures = false;
    let skipped = false;
    let ownershipChanged = false;
    this._bumpDebugCounter("syncCitationTagsRuns");

    try {
      const activeCitedIDSet = new Set();
      if (Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.enable", true) !== false) {
        for (const sid in this._sessionCitedIDs) {
          const ids = this._sessionCitedIDs[sid] || [];
          ids.forEach(id => activeCitedIDSet.add(Number(id)));
        }
      }

      for (const itemID of activeCitedIDSet) {
        if (!Number.isInteger(itemID) || itemID <= 0) continue;
        try {
          let item = Zotero.Items.get(itemID);
          if (!item && typeof Zotero.Items.getAsync === "function") item = await Zotero.Items.getAsync(itemID);
          if (!item) continue;
          if (!this._isWritableCitationItem(item)) {
            if (item.libraryID === Zotero.Libraries?.userLibraryID || this._managedCitationTagIDs[itemID]) skipped = true;
            continue;
          }
          if (Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.enable", true) === false || this._citationTagName !== tagName) break;

          const oldName = this._managedCitationTagIDs[itemID] && (this._managedCitationTagNames[itemID] || "/Citations");
          const hasTag = name => typeof item.hasTag === "function" ? item.hasTag(name)
            : (item.getTags?.() || []).some(tag => (typeof tag === "string" ? tag : tag?.tag) === name);
          const removeOld = oldName && oldName !== tagName && hasTag(oldName);
          const addNew = !hasTag(tagName);

          if ((removeOld && typeof item.removeTag !== "function") || (addNew && typeof item.addTag !== "function")) {
            skipped = true;
            continue;
          }
          if (removeOld || addNew) {
            if (removeOld) item.removeTag(oldName);
            if (addNew) item.addTag(tagName);
            try {
              await item.saveTx();
              touchedCount += 1;
              ownershipChanged = true;
            } catch (saveError) {
              try {
                if (addNew) item.removeTag(tagName);
                if (removeOld) item.addTag(oldName);
              } catch (rollbackError) {
                this.logError(`Failed to roll back citation tag change for item ${itemID}`, rollbackError);
              }
              throw saveError;
            }
          }
          if (oldName && oldName !== tagName) {
            delete this._managedCitationTagIDs[itemID];
            delete this._managedCitationTagNames[itemID];
            ownershipChanged = true;
          }
          if (addNew || (oldName === tagName && this._managedCitationTagIDs[itemID])) {
            this._managedCitationTagIDs[itemID] = true;
            this._managedCitationTagNames[itemID] = tagName;
          }
          if (touchedCount > 0 && touchedCount % 30 === 0 && touchedCount !== lastYieldedTouchCount) {
            lastYieldedTouchCount = touchedCount;
            await Zotero.Promise.delay(0);
          }
        } catch (e) {
          hadFailures = true;
          this._bumpDebugCounter("syncCitationTagsFailures");
          this.logError(`Failed to add or rename citation tag for item ${itemID}`, e);
        }
      }

      const managedIDs = Object.keys(this._managedCitationTagIDs).map(id => Number(id));
      for (const itemID of managedIDs) {
        if (activeCitedIDSet.has(itemID)) continue;
        try {
          let item = Zotero.Items.get(itemID);
          if (!item && typeof Zotero.Items.getAsync === "function") item = await Zotero.Items.getAsync(itemID);
          if (!item) {
            delete this._managedCitationTagIDs[itemID];
            delete this._managedCitationTagNames[itemID];
            ownershipChanged = true;
            continue;
          }
          if (!this._isWritableCitationItem(item)) {
            skipped = true;
            continue;
          }
          const managedName = this._managedCitationTagNames[itemID] || "/Citations";
          const hasCitationTag = typeof item.hasTag === "function" ? item.hasTag(managedName)
            : (item.getTags?.() || []).some(tag => (typeof tag === "string" ? tag : tag?.tag) === managedName);

          if (hasCitationTag && typeof item.removeTag === "function") {
            item.removeTag(managedName);
            try {
              await item.saveTx();
              touchedCount += 1;
            } catch (saveError) {
              try {
                if (typeof item.addTag === "function") item.addTag(managedName);
              } catch (rollbackError) {
                runtime?.log?.("[Citation syncCitationTags] Failed to roll back tag removal", itemID, rollbackError);
              }
              throw saveError;
            }
          }
          delete this._managedCitationTagIDs[itemID];
          delete this._managedCitationTagNames[itemID];
          ownershipChanged = true;

          if (touchedCount > 0 && touchedCount % 30 === 0 && touchedCount !== lastYieldedTouchCount) {
            lastYieldedTouchCount = touchedCount;
            await Zotero.Promise.delay(0);
          }
        } catch (e) {
          hadFailures = true;
          this._bumpDebugCounter("syncCitationTagsFailures");
          this.logError(`Failed to remove citation tag for item ${itemID}`, e);
        }
      }
    } finally {
      if (ownershipChanged || hadFailures || this._tagOwnershipDirty) {
        this._tagOwnershipDirty = this._saveManagedTagIDs() === false;
        if (this._tagOwnershipDirty) hadFailures = true;
      }
      if (touchedCount > 0) this._bumpDebugCounter("syncCitationTagsTouched", touchedCount);
      if (hadFailures) delete this._lastTagSyncSig[sessionID];
      this._recordPerf("syncCitationTags", Date.now() - perfStart);
    }
    return { complete: !hadFailures && !skipped, touchedCount };
  }

  // ============================================================================
  // Section 10: Citation Formatting & Tree View Refresh
  // ============================================================================

  /**
   * Schedules a debounced session refresh after retry delay.
   * @param {string} sessionID - Session identifier
   * @param {object} targetSession - Word session
   * @param {number} [delayMs=180] - Debounce delay in milliseconds
   * @private
   */
  _scheduleSessionRefresh(sessionID, targetSession, delayMs = 180) {
    if (this._listenerStopped || this._refreshRetryTimerBySession[sessionID]) return;
    this._refreshRetryTimerBySession[sessionID] = globalThis.setTimeout(() => {
      delete this._refreshRetryTimerBySession[sessionID];
      if (this._listenerStopped || !this.sessions?.[sessionID]) return;
      void this.refreshSessionCitations(sessionID, targetSession).catch(error => this.logError("Failed to retry citation refresh", error));
    }, Math.max(50, delayMs));
  }

  /**
   * Terminates and cleans up an individual Word session.
   * @param {string} sessionID - Session identifier
   * @param {boolean} [skipTagCleanup=false] - Whether to bypass tag removal
   * @returns {Promise<void>}
   */
  async clearSession(sessionID, skipTagCleanup = false) {
    const session = this.sessions?.[sessionID];
    if (!session) return;
    session.closing = true;
    this._sessionUpdateRevision[sessionID] = (this._sessionUpdateRevision[sessionID] || 0) + 1;
    await Promise.allSettled([session._renameTask, this._sessionUpdateQueue[sessionID]].filter(Boolean));

    if (this._tagSyncTimerBySession[sessionID]) {
      globalThis.clearTimeout(this._tagSyncTimerBySession[sessionID]);
      delete this._tagSyncTimerBySession[sessionID];
    }
    delete this._pendingTagSyncIDsBySession[sessionID];
    delete this._sessionCitedIDs[sessionID];

    if (!skipTagCleanup) {
      const tagTask = this._tagSyncInFlightBySession[sessionID];
      if (tagTask && typeof tagTask.then === "function") await Promise.allSettled([tagTask]);
      try {
        await this.syncCitationTags(sessionID, []);
      } catch (error) {
        this.logError(`Failed to update citation tags while closing ${sessionID}`, error);
      }
    }
    this.cleanupSessionState(sessionID, true);
    this._pendingCollectionNames?.delete(sessionID);
    const collection = session.collection;
    if (!collection?.id) return;
    try {
      await collection.eraseTx();
      this._temporaryCollectionKeys.delete(collection.key);
      this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);
    } catch (error) {
      this.logError(`Failed to remove Word citation collection ${collection.name || collection.key}`, error);
    }
  }

  /**
   * Public entry point for refreshing session citations with task tracking.
   * @param {string} sessionID - Session identifier
   * @param {object} [session] - Optional native session object
   * @returns {Promise<void>}
   */
  async refreshSessionCitations(sessionID, session) {
    const task = this._refreshSessionCitations(sessionID, session);
    (this._activeRefreshTasks ??= new Set()).add(task);
    try {
      return await task;
    } finally {
      this._activeRefreshTasks.delete(task);
    }
  }

  /**
   * Refreshes citation data from the Word document and dispatches tag/view updates.
   * @param {string} sessionID - Session identifier
   * @param {object} session - Native Word session object
   * @returns {Promise<void>}
   * @private
   */
  async _refreshSessionCitations(sessionID, session) {
    const perfStart = Date.now();
    if (this._listenerStopped || !this.sessions?.[sessionID] || this.sessions[sessionID].closing) return;
    const targetSession = session || Zotero.Integration.sessions[sessionID];
    if (!targetSession) return;

    this._refreshStateBySession ??= new WeakMap();
    let refreshState = this._refreshStateBySession.get(targetSession);
    if (!refreshState) {
      refreshState = {};
      this._refreshStateBySession.set(targetSession, refreshState);
    }
    if (refreshState.syncing) {
      refreshState.pending = true;
      return;
    }

    try {
      const now = Date.now();
      const last = this._lastRefreshAt[sessionID] || 0;
      if (now - last < this._minRefreshInterval) {
        this._scheduleSessionRefresh(sessionID, targetSession, this._minRefreshInterval - (now - last) + 25);
        return;
      }
      this._lastRefreshAt[sessionID] = now;
    } catch {}

    refreshState.syncing = true;
    try {
      let citationsByItemID = targetSession.citationsByItemID;
      let citationsByIndex = targetSession.citationsByIndex;

      if (!citationsByItemID || typeof citationsByItemID !== "object") {
        await targetSession.updateFromDocument(0);
        citationsByItemID = targetSession.citationsByItemID || {};
      }
      if (!citationsByIndex || typeof citationsByIndex !== "object") {
        await targetSession.updateFromDocument(0);
        citationsByIndex = targetSession.citationsByIndex || {};
      }

      if (Object.keys(citationsByIndex).length === 0 && Object.keys(citationsByItemID).length > 0) {
        await Zotero.Promise.delay(50);
        await targetSession.updateFromDocument(0);
        citationsByIndex = targetSession.citationsByIndex || {};
        citationsByItemID = targetSession.citationsByItemID || {};
        if (Object.keys(citationsByIndex).length === 0) {
          this._emptyReadCountBySession[sessionID] = 0;
          this._scheduleSessionRefresh(sessionID, targetSession, 250);
          return;
        }
      }

      if (Object.keys(citationsByIndex).length === 0) {
        const emptyItemMap = Object.keys(citationsByItemID).length === 0;
        if (!emptyItemMap) {
          this._emptyReadCountBySession[sessionID] = 0;
          this._scheduleSessionRefresh(sessionID, targetSession, 250);
          return;
        }
        const emptyReadCount = (this._emptyReadCountBySession[sessionID] || 0) + 1;
        this._emptyReadCountBySession[sessionID] = emptyReadCount;
        if (emptyReadCount < 2) {
          this._scheduleSessionRefresh(sessionID, targetSession, 250);
          return;
        }
        this.scheduleCitationTagSync(sessionID, [], true);
        await this.updateCitations(sessionID, {}, [], targetSession.styleClass);
        return;
      }

      this._emptyReadCountBySession[sessionID] = 0;
      const sortedItemIDs = this.getSortedItemIDs(citationsByIndex, sessionID);
      if (this._listenerStopped || !this.sessions?.[sessionID]) return;
      if (!Array.isArray(sortedItemIDs) || sortedItemIDs.length === 0) return;

      this.scheduleCitationTagSync(sessionID, sortedItemIDs);
      await this.updateCitations(sessionID, citationsByItemID, sortedItemIDs, targetSession.styleClass);
    } catch (e) {
      this.logError("Citation snapshot refresh failed", e);
    } finally {
      refreshState.syncing = false;
      if (refreshState.pending) {
        refreshState.pending = false;
        this._scheduleSessionRefresh(sessionID, targetSession, this._minRefreshInterval);
      }
      this._recordPerf("refreshSessionCitations", Date.now() - perfStart);
    }
  }

  /**
   * Schedules a debounced refresh of the citation column in all open Zotero windows.
   */
  scheduleItemsViewRefresh() {
    if (this._itemsViewRefreshTimer || this._listenerStopped) return;
    this._itemsViewRefreshTimer = globalThis.setTimeout(async () => {
      this._itemsViewRefreshTimer = null;
      if (this._listenerStopped) return;
      const panes = Zotero.getMainWindows?.().map(win => win.ZoteroPane) || [globalThis.ZoteroPane];
      for (const pane of panes) {
        try {
          await pane?.itemsView?.refreshAndMaintainSelection();
        } catch (error) {
          this.logError("Cannot refresh the citation column", error);
        }
      }
    }, this._itemsViewRefreshDebounceMs);
  }

  /**
   * Queues an asynchronous citation update with revision tracking.
   * @param {string} sessionID - Session identifier
   * @param {object} citationsByItemID - Citations indexed by item ID
   * @param {number[]} sortedItemIDs - Sorted document item order
   * @param {string} styleClass - Citation style class ("note" or "in-text")
   * @returns {Promise<void>}
   */
  async updateCitations(sessionID, citationsByItemID, sortedItemIDs, styleClass) {
    if (this._listenerStopped || !this.sessions?.[sessionID] || this.sessions[sessionID].closing) return;
    if (citationsByItemID && typeof citationsByItemID === "object") {
      citationsByItemID = Object.fromEntries(Object.entries(citationsByItemID).map(([id, values]) => [
        id,
        Array.isArray(values) ? values.map(value => ({ properties: { plainCitation: value?.properties?.plainCitation } })) : values
      ]));
    }
    if (Array.isArray(sortedItemIDs)) sortedItemIDs = [...sortedItemIDs];
    const revision = (this._sessionUpdateRevision[sessionID] || 0) + 1;
    this._sessionUpdateRevision[sessionID] = revision;
    const previous = this._sessionUpdateQueue[sessionID] || Promise.resolve();

    const task = previous.catch(error => {
      this.logError(`Previous citation update failed for ${sessionID}`, error);
    }).then(async () => {
      if (this._listenerStopped || !this.sessions?.[sessionID] || this._sessionUpdateRevision[sessionID] !== revision) return;
      await this._applyCitations(sessionID, citationsByItemID, sortedItemIDs, styleClass, revision);
    });

    this._sessionUpdateQueue[sessionID] = task;
    try {
      await task;
    } finally {
      if (this._sessionUpdateQueue[sessionID] === task) delete this._sessionUpdateQueue[sessionID];
    }
  }

  /**
   * Formats item plain citations and synchronizes session collection items.
   * @param {string} sessionID - Session identifier
   * @param {object} citationsByItemID - Citations indexed by item ID
   * @param {number[]} sortedItemIDs - Sorted document item order
   * @param {string} styleClass - Citation style class
   * @param {number} revision - Expected revision number
   * @returns {Promise<void>}
   * @private
   */
  async _applyCitations(sessionID, citationsByItemID, sortedItemIDs, styleClass, revision) {
    if (!citationsByItemID || typeof citationsByItemID !== "object" || !Array.isArray(sortedItemIDs)) return;

    const citationIDKeys = Object.keys(citationsByItemID);
    const isNoteStyle = styleClass === "note";
    const idIndexMap = new Map(sortedItemIDs.map((id, idx) => [Number(id), idx]));
    const oldIdData = this.sessions[sessionID]?.idData || {};

    const formatItemPlainCitation = id => {
      const index = idIndexMap.get(Number(id));
      if (index === undefined) {
        const previousValue = oldIdData[id]?.plainCitation;
        if (previousValue) return previousValue;
        return isNoteStyle ? "—" : "—: (pending)";
      }
      const order = index + 1;
      if (isNoteStyle) return String(order);
      const citations = citationsByItemID[id];
      if (!Array.isArray(citations) || citations.length === 0) return `${order}: (error)`;
      return `${order}: ` + citations.map(i => i?.properties?.plainCitation || "(no text)").join(", ");
    };

    const targetData = {};
    for (const id of citationIDKeys) {
      try {
        targetData[id] = { plainCitation: formatItemPlainCitation(id) };
      } catch (e) {
        targetData[id] = { plainCitation: "(error)" };
      }
    }

    if (!this.sessions[sessionID]) return;

    let hasChanges = Object.keys(targetData).length !== Object.keys(oldIdData).length;
    if (!hasChanges) {
      for (const id in targetData) {
        if (targetData[id].plainCitation !== oldIdData[id]?.plainCitation) {
          hasChanges = true;
          break;
        }
      }
    }

    const citationSession = this.sessions[sessionID];
    const userLibraryID = Zotero.Libraries.userLibraryID;
    const targetIDs = citationIDKeys.map(Number).filter(id => {
      const item = Zotero.Items.get(id);
      return item && item.libraryID === userLibraryID && (typeof item.isTopLevelItem !== "function" || item.isTopLevelItem());
    });

    if (this._sessionUpdateRevision[sessionID] !== revision) return;
    await this.syncCollectionItems(citationSession, targetIDs);

    if (this._listenerStopped || citationSession.closing
      || this._sessionUpdateRevision[sessionID] !== revision || this.sessions?.[sessionID] !== citationSession) {
      return;
    }

    if (hasChanges) {
      citationSession.idData = targetData;
      this._invalidateSessionIndex();
      this.scheduleItemsViewRefresh();
    }
  }

  // ============================================================================
  // Section 11: Lifecycle Teardown & Resource Disposal
  // ============================================================================

  /**
   * Idempotently initiates citation coordinator teardown.
   * @returns {Promise<void>}
   */
  clear() {
    if (!this._clearPromise) this._clearPromise = this._performClear();
    return this._clearPromise;
  }

  /**
   * Performs full teardown: restores wrappers, stops timers, clears tags and collections.
   * @returns {Promise<void>}
   * @private
   */
  async _performClear() {
    this._listenerStopped = true;
    this._setActiveSessionID(null);
    this._isExecCommandRunning = false;
    this._execCommandDepth = 0;

    if (this._getSessionWrapper && Zotero.Integration.getSession === this._getSessionWrapper) {
      Zotero.Integration.getSession = this._originalGetSession;
    }
    this._getSessionWrapper = null;
    this._originalGetSession = null;

    for (const sessionID of Object.keys(this._collectionRenameRetryTimerBySession || {})) {
      this._clearCollectionRenameRetry(sessionID);
    }
    if (this._listenerTimer) {
      globalThis.clearTimeout(this._listenerTimer);
      this._listenerTimer = null;
    }

    if (this._isExecCommandHooked && this._originalExecCommand
      && Zotero.Integration.execCommand === this._execCommandWrapper) {
      Zotero.Integration.execCommand = this._originalExecCommand;
      this._isExecCommandHooked = false;
      this._originalExecCommand = null;
      this._execCommandWrapper = null;
      this._bumpDebugCounter("execHookRestored");
    } else if (this._isExecCommandHooked) {
      this._isExecCommandHooked = false;
      this._originalExecCommand = null;
      this._execCommandWrapper = null;
    }

    await Promise.allSettled([
      this._listenerTickTask,
      ...this._initializationTasks?.values() || [],
      ...this._activeRefreshTasks || []
    ].filter(Boolean));

    for (const sessionID in this._tagSyncTimerBySession) {
      globalThis.clearTimeout(this._tagSyncTimerBySession[sessionID]);
    }
    this._tagSyncTimerBySession = {};
    this._pendingTagSyncIDsBySession = {};

    const tagTasks = [...Object.values(this._tagSyncInFlightBySession), this._tagSyncQueue].filter(t => t && typeof t.then === "function");
    if (tagTasks.length) await Promise.allSettled(tagTasks);

    this._sessionCitedIDs = {};
    try {
      await this.syncCitationTags("__shutdown__", []);
    } catch (error) {
      this.logError("Failed to remove managed citation tags during shutdown", error);
    }

    const sessionIDs = Object.keys(this.sessions || {});
    const cleanupResults = await Promise.allSettled(sessionIDs.map(id => this.clearSession(id, true)));
    for (const result of cleanupResults) {
      if (result.status === "rejected") {
        this.logError("Failed to remove a Word citation collection during shutdown", result.reason);
      }
    }

    try {
      if (this._itemsViewRefreshTimer) {
        globalThis.clearTimeout(this._itemsViewRefreshTimer);
        this._itemsViewRefreshTimer = null;
      }
      this._sortedCacheBySession = {};
      this._lastRefreshAt = {};
      this._lastTagSyncSig = {};
      this._sessionCitedIDs = {};
      this._managedCitationTagIDs = {};
      this._tagSyncInFlightBySession = {};
      this._pendingTagSyncIDsBySession = {};
      this._tagSyncTimerBySession = {};
      this._sessionUpdateQueue = {};
      this._sessionUpdateRevision = {};
      this._emptyReadCountBySession = {};
      this._missingSessionCountBySession = {};
      this._docIdBySession = {};
      this._execCommandBindings.clear();
      this._collectionRenameRetryTimerBySession = {};
      this._collectionRenameRetryCountBySession = {};
      for (const sessionID in this._refreshRetryTimerBySession) {
        globalThis.clearTimeout(this._refreshRetryTimerBySession[sessionID]);
      }
      this._refreshRetryTimerBySession = {};
    } catch {}
  }
}
