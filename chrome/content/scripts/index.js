(() => {
  // src/config.mjs
  var config = {
    addonName: "Zotero CiteFlow",
    addonID: "citeflow@groele",
    addonRef: "zoterocitation",
    addonInstance: "ZoteroCitation"
  };

  // src/modules/locale.mjs
  async function initLocale() {
    if (addon.data.locale) return;
    const Localization = runtime.getGlobal("Localization") ?? ChromeUtils.importESModule("resource://gre/modules/Localization.sys.mjs").Localization;
    const l10n = new Localization([`${config.addonRef}-addon.ftl`]);
    const [value, pending, unknownDrop] = await Promise.all([
      l10n.formatValue(`${config.addonRef}-column-citation`),
      l10n.formatValue(`${config.addonRef}-collection-pending`),
      l10n.formatValue(`${config.addonRef}-drag-target-unknown`)
    ]);
    if (addon.data.alive) addon.data.locale = {
      "column-citation": value || "Citation",
      "collection-pending": pending || "Word document (pending name)",
      "drag-target-unknown": unknownDrop || "Could not confirm the Word drop target. Drag the item onto a Word document and try again."
    };
  }
  function getString(key) {
    return addon.data.locale?.[key] || `${config.addonRef}-${key}`;
  }

  // src/modules/citation/constants.mjs
  var TEMP_COLLECTION_RELATION = "dc:relation";
  var TEMP_COLLECTION_MARKER = "https://github.com/groele/Zotero-CiteFlow#temporary-collection";
  var LEGACY_UPSTREAM_TEMP_COLLECTION_MARKER = "https://github.com/MuiseDestiny/zotero-citation#temporary-collection";
  var TEMP_COLLECTION_KEYS_PREF = "zotero-citation.temporaryCollectionKeys";
  var TEMP_SEARCH_KEYS_PREF = "zotero-citation.managedSearchKeys";
  var MANAGED_TAG_IDS_PREF = "zotero-citation.managedCitationTagIDs";
  var MANAGED_TAG_STATE_PREF = "zotero-citation.managedCitationTagState";

  // src/modules/citation.mjs
  var Citation = class {
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
      this._initializationTasks = /* @__PURE__ */ new Map();
      this._activeRefreshTasks = /* @__PURE__ */ new Set();
      this._refreshStateBySession = /* @__PURE__ */ new WeakMap();
      this._sessionUpdateQueue = {};
      this._sessionUpdateRevision = {};
      this._emptyReadCountBySession = {};
      this._refreshRetryTimerBySession = {};
      this._missingSessionCountBySession = {};
      this._docIdBySession = {};
      this._pendingCollectionNames = /* @__PURE__ */ new Map();
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
      } catch {
      }
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
    _initWordIntegrationState() {
      this._execCommandBindings = /* @__PURE__ */ new Map();
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
      this._tagSyncDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.citationTagDebounceMs", 150, 0, 2e3);
      this._itemsViewRefreshDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.itemsViewRefreshDebounceMs", 120, 0, 2e3);
      this._healthWindowMs = this._getClampedIntPref("extensions.zotero.zoterocitation.healthWindowMs", 3e5, 1e4, 36e5);
      this._perfSlowThresholdMs = this._getClampedIntPref("extensions.zotero.zoterocitation.perfSlowThresholdMs", 50, 5, 5e3);
      this._listenerTimer = null;
      this._listenerStopped = false;
      this.debugLog = (...args) => {
        if (this._debugEnabled) runtime.log(...args);
      };
    }
    /**
     * Records an error message and optional cause into bounded diagnostic error history.
     * @param {string} message - Descriptive error message
     * @param {Error} [cause] - Underlying exception
     */
    logError(message, cause) {
      const error = new Error(message, cause ? { cause } : void 0);
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
        errors: [...this._errors || []],
        performance: this.getPerformanceStats()
      };
    }
    /**
     * Returns internal debug statistics, counters, and execution states.
     * @returns {object} Debug statistics
     */
    getDebugStats() {
      const healthWindow = this._healthWindowMs || 3e5;
      return {
        counters: { ...this._debugCounters || {} },
        recent: {
          errorCount: (this._errors || []).filter((e) => e.time >= Date.now() - healthWindow).length
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
     * Clamps an optional check wait duration to [0, 600000] ms.
     * @param {number} waitMs - Raw wait duration
     * @returns {number} Safe wait duration in milliseconds
     * @private
     */
    _sanitizeCheckWaitMs(waitMs) {
      return Number.isFinite(Number(waitMs)) ? Math.max(0, Math.min(6e5, Math.trunc(Number(waitMs)))) : 0;
    }
    /**
     * Runs an asynchronous health summary check with optional reset and delay.
     * @param {{ reset?: boolean, waitMs?: number }} [options]
     * @returns {Promise<object>}
     */
    async runHealthSummaryCheck(options = {}) {
      const { reset = false, waitMs = 0 } = options || {};
      if (reset) this.resetDebugStats();
      const safeWaitMs = this._sanitizeCheckWaitMs(waitMs);
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
      const safeWaitMs = this._sanitizeCheckWaitMs(waitMs);
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
      const safeWaitMs = this._sanitizeCheckWaitMs(waitMs);
      if (safeWaitMs > 0) await Zotero.Promise.delay(safeWaitMs);
      return { ...this.getPerformanceStats(), meta: { resetPerformed: !!reset, waitedMs: safeWaitMs } };
    }
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
        if (typeof raw !== "number" && typeof raw !== "string" || typeof raw === "string" && !raw.trim()) return fallback;
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
      return typeof name === "string" && name.trim() && name.trim().length <= 200 && !/[\x00-\x1f\x7f]/.test(name) ? name.trim() : "/Citations";
    }
    /**
     * Applies updated preferences and triggers dynamic tag synchronization if tag settings changed.
     * @returns {Promise<object>|undefined}
     */
    applyPreferences() {
      const collectionsEnabled = Zotero.Prefs.get("extensions.zotero.zoterocitation.collections.enable", true) !== false;
      const collectionsChanged = this._collectionsEnabled !== void 0 && this._collectionsEnabled !== collectionsEnabled;
      this._collectionsEnabled = collectionsEnabled;
      const tagsEnabled = Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.enable", true) !== false;
      const tagsChanged = this._citationTagsEnabled !== void 0 && this._citationTagsEnabled !== tagsEnabled;
      const tagName = this._getCitationTagName();
      const tagRenamed = this._citationTagName !== void 0 && this._citationTagName !== tagName;
      this._citationTagsEnabled = tagsEnabled;
      this._citationTagName = tagName;
      this._debugEnabled = this._getBoolPref("extensions.zotero.zoterocitation.debug", false);
      if (globalThis.addon?.data) addon.data.citationDebugEnabled = this._debugEnabled;
      this._tagSyncDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.citationTagDebounceMs", 150, 0, 2e3);
      this._itemsViewRefreshDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.itemsViewRefreshDebounceMs", 120, 0, 2e3);
      this._healthWindowMs = this._getClampedIntPref("extensions.zotero.zoterocitation.healthWindowMs", 3e5, 1e4, 36e5);
      this._perfSlowThresholdMs = this._getClampedIntPref("extensions.zotero.zoterocitation.perfSlowThresholdMs", 50, 5, 5e3);
      if (collectionsChanged && !collectionsEnabled) {
        this.clearStaleArtifacts().catch((e) => this.logError("Failed to clear collections on disable", e));
        for (const session of Object.values(this.sessions || {})) {
          if (session.collection) {
            try {
              session.collection.eraseTx().catch(() => {
              });
            } catch {
            }
            delete session.collection;
          }
        }
      } else if (collectionsChanged && collectionsEnabled) {
        for (const [id, session] of Object.entries(this.sessions || {})) {
          if (!session.collection && !session.closing) {
            this.initCollection(id, session).catch(() => {
            });
          }
        }
      }
      if (tagsChanged || tagRenamed || this._tagPreferencesNeedSync) {
        this._lastTagSyncSig = {};
        this._tagPreferencesNeedSync = true;
        return this.syncCitationTags("__preferences__", []).then((result) => {
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
        return new Set(Array.isArray(values) ? values.filter((v) => typeof v === "string" && v) : []);
      } catch {
        return /* @__PURE__ */ new Set();
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
          const entries = Object.entries(state.tags).filter(([id, name]) => Number.isSafeInteger(Number(id)) && Number(id) > 0 && typeof name === "string" && name.trim() && name.length <= 200 && !/[\x00-\x1f\x7f]/.test(name));
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
      return this._loadLegacyManagedTagState();
    }
    /**
     * Migrates legacy array-based managed citation tag IDs from preferences.
     * @returns {{ ids: object, names: object }}
     * @private
     */
    _loadLegacyManagedTagState() {
      try {
        let rawKeys = Zotero.Prefs.get(MANAGED_TAG_IDS_PREF);
        if (!rawKeys) {
          const legacyRaw = Zotero.Prefs.get(MANAGED_TAG_IDS_PREF, true);
          if (legacyRaw) rawKeys = legacyRaw;
        }
        const keys = rawKeys ? JSON.parse(rawKeys) : [];
        const validKeys = Array.isArray(keys) ? keys.filter((k) => (typeof k === "string" || typeof k === "number") && Number.isSafeInteger(Number(k)) && Number(k) > 0).map(String) : [];
        return {
          ids: Object.fromEntries(validKeys.map((k) => [k, true])),
          names: Object.fromEntries(validKeys.map((k) => [k, "/Citations"]))
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
          Object.keys(this._managedCitationTagIDs || {}).map((id) => [id, this._managedCitationTagNames?.[id] || "/Citations"])
        );
        Zotero.Prefs.set(MANAGED_TAG_STATE_PREF, JSON.stringify({ version: 1, tags }));
        Zotero.Prefs.set(MANAGED_TAG_IDS_PREF, JSON.stringify(Object.keys(this._managedCitationTagIDs || {})));
        return true;
      } catch (error) {
        this.logError("Failed to save managed citation tag state", error);
        return false;
      }
    }
    /**
     * Strips control characters, collapses whitespace, and clamps folder names to 200 characters.
     * @param {string} rawName - Raw folder name candidate
     * @returns {string} Sanitized folder name
     * @private
     */
    _sanitizeFolderName(rawName) {
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
    _parseWordWindowTitle(rawTitle) {
      if (typeof rawTitle !== "string") return "";
      let cleaned = rawTitle.replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\uFEFF]/g, " ").replace(/\s+/g, " ").trim();
      if (!cleaned) return "";
      if (cleaned.startsWith("window-title:")) {
        cleaned = cleaned.slice("window-title:".length).trim();
        if (!cleaned) return "";
        if (!/\s+[-–—]\s+(?:Microsoft\s+)?Word(?:\s*\([^)]*\))?$/i.test(cleaned)) {
          try {
            return this._sanitizeFolderName(cleaned.normalize("NFC"));
          } catch {
            return this._sanitizeFolderName(cleaned);
          }
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
    _getDocumentDisplayName(docId) {
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
          } catch {
          }
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
          candidate = candidate.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match) => {
            try {
              return decodeURIComponent(match);
            } catch {
              return match;
            }
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
    _extractSessionDocumentId(nativeSession, docObj) {
      const doc = docObj ?? nativeSession?._doc ?? nativeSession?.doc;
      const candidates = [
        typeof doc === "string" ? doc : null,
        doc?.docId,
        doc?.documentPath,
        doc?.documentName,
        doc?.fullName,
        doc?.filePath,
        doc?.path,
        doc?.url,
        doc?.uri,
        doc?.filename,
        doc?.title,
        doc?.name,
        nativeSession?.docId,
        nativeSession?.documentPath,
        nativeSession?.documentName,
        nativeSession?.filePath,
        nativeSession?.path,
        nativeSession?.title,
        nativeSession?.name
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
    _resolveFallbackDocumentId(sessionID, nativeSession, docObj, allowForeground = false) {
      const fromSession = this._extractSessionDocumentId(nativeSession, docObj);
      if (fromSession) return fromSession;
      const addonData = typeof addon !== "undefined" ? addon?.data : null;
      if (allowForeground && addonData?.lastDroppedWordWindow) {
        const { title, at } = addonData.lastDroppedWordWindow;
        delete addonData.lastDroppedWordWindow;
        if (typeof at === "number" && Date.now() - at <= 15e3) {
          const droppedName = this._parseWordWindowTitle(title);
          if (droppedName) return `window-title:${droppedName}`;
        }
      }
      if (typeof addonData?.probeWordWindowTitles === "function") {
        const probed = addonData.probeWordWindowTitles();
        if (allowForeground && probed?.foregroundTitle) {
          const fgName = this._parseWordWindowTitle(probed.foregroundTitle);
          if (fgName) return `window-title:${fgName}`;
        }
        const visibleNames = [...new Set(
          (probed?.visibleTitles || []).map((t) => this._parseWordWindowTitle(t)).filter(Boolean)
        )];
        if (visibleNames.length > 0) {
          const claimedByOthers = /* @__PURE__ */ new Set();
          let otherUnidentifiedCount = 0;
          for (const otherID of Object.keys(this.sessions || {})) {
            if (otherID === sessionID || this.sessions[otherID]?.closing) continue;
            const otherDocId = this._docIdBySession?.[otherID] || this.sessions[otherID]?.docId;
            const otherName = otherDocId ? this._getDocumentDisplayName(otherDocId) : "";
            if (otherName) claimedByOthers.add(otherName);
            else otherUnidentifiedCount++;
          }
          const unclaimed = visibleNames.filter((name) => !claimedByOthers.has(name));
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
    _isPendingCollectionName(name, sessionID) {
      if (!name || typeof name !== "string") return true;
      const prefix2 = getString("collection-pending");
      if (sessionID && this._pendingCollectionNames?.has(sessionID)) {
        if (name === `${prefix2} ${this._pendingCollectionNames.get(sessionID)}`) return true;
      }
      return Boolean(prefix2 && name.startsWith(`${prefix2} `));
    }
    /**
     * Generates a sequenced pending collection name for an unidentified Word session.
     * @param {string} sessionID - Word session identifier
     * @returns {string} Sequenced pending name
     * @private
     */
    _getPendingCollectionName(sessionID) {
      this._pendingCollectionNames ??= /* @__PURE__ */ new Map();
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
      } catch {
      }
    }
    /**
     * Purges orphan temporary collections and legacy searches without modifying user collections.
     * @returns {Promise<void>}
     */
    async clearStaleArtifacts() {
      const libraryID = Zotero.Libraries.userLibraryID;
      await this._clearStaleTemporaryCollections(libraryID);
      await this._clearStaleManagedSearches(libraryID);
    }
    /**
     * Purges tracked and relation-marked stale temporary citation collections.
     * @param {number} libraryID - Target user library ID
     * @returns {Promise<void>}
     * @private
     */
    async _clearStaleTemporaryCollections(libraryID) {
      const collections = Zotero.Collections.getByLibrary(libraryID, true, true);
      const collectionsByKey = new Map(collections.map((c) => [c.key, c]));
      const activeKeys = new Set(
        Object.values(this.sessions || {}).filter((s) => s && !s.closing && s.collection?.key).map((s) => s.collection.key)
      );
      const removedKeys = /* @__PURE__ */ new Set();
      const remainingKeys = /* @__PURE__ */ new Set();
      for (const key of this._temporaryCollectionKeys || []) {
        if (activeKeys.has(key)) {
          remainingKeys.add(key);
          continue;
        }
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
        if (removedKeys.has(collection.key) || activeKeys.has(collection.key)) continue;
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
    }
    /**
     * Purges legacy plugin-managed saved searches from the user library.
     * @param {number} libraryID - Target user library ID
     * @returns {Promise<void>}
     * @private
     */
    async _clearStaleManagedSearches(libraryID) {
      if (!this._managedSearchKeys?.size) return;
      const searchesByKey = new Map(Zotero.Searches.getByLibrary(libraryID).map((s) => [s.key, s]));
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
      if (Zotero.Prefs.get("extensions.zotero.zoterocitation.collections.enable", true) === false) return;
      const collection = new Zotero.Collection();
      collection._isCiteFlowCollection = true;
      collection.libraryID = Zotero.Libraries.userLibraryID;
      const knownDocId = session.docId || this._docIdBySession?.[sessionID];
      const knownName = knownDocId ? this._getDocumentDisplayName(knownDocId) : "";
      collection.name = knownName || this._getPendingCollectionName(sessionID);
      session.lastName = collection.name;
      try {
        if (typeof collection.addRelation === "function") {
          collection.addRelation(TEMP_COLLECTION_RELATION, TEMP_COLLECTION_MARKER);
        }
      } catch (error) {
        this.logError("Failed to mark temporary Word citation collection", error);
      }
      if (collection.key) {
        this._temporaryCollectionKeys.add(collection.key);
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
      addon?.data?.views?.repositionCitationCollections?.();
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
      if (Zotero.Prefs.get("extensions.zotero.zoterocitation.collections.enable", true) === false) return;
      const normalizedTargetIDs = [...new Set(targetIDs.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
      const currentIDs = collection.getChildItems(true).map((itemOrID) => typeof itemOrID === "number" ? itemOrID : itemOrID?.id).filter((id) => Number.isSafeInteger(id) && id > 0);
      const targetSet = new Set(normalizedTargetIDs);
      const currentSet = new Set(currentIDs);
      const remove = currentIDs.filter((id) => !targetSet.has(id));
      const add = normalizedTargetIDs.filter((id) => !currentSet.has(id));
      if (!remove.length && !add.length) return;
      try {
        await Zotero.DB.executeTransaction(async () => {
          if (this._listenerStopped || session.closing) return;
          if (remove.length) await collection.removeItems(remove);
          if (add.length) await collection.addItems(add);
        });
      } catch (error) {
        this.logError("Failed to synchronize Word citation collection items", error);
      }
    }
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
      if (attempt > 4) {
        this.debugLog("[Citation execCommand] collection rename retries exhausted", sessionID);
        return;
      }
      this._collectionRenameRetryCountBySession[sessionID] = attempt;
      this._collectionRenameRetryTimerBySession[sessionID] = globalThis.setTimeout(() => {
        delete this._collectionRenameRetryTimerBySession[sessionID];
        const session = this.sessions?.[sessionID];
        if (this._listenerStopped || !session?.collection || docId && this._docIdBySession?.[sessionID] !== docId) return;
        this._renameCollection(sessionID, targetName, docId).catch((error) => {
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
      const task = (session._renameTask || Promise.resolve()).catch(() => {
      }).then(async () => {
        if (this._listenerStopped || session.closing || this.sessions?.[sessionID] !== session || docId && this._docIdBySession[sessionID] !== docId || !session.collection) return;
        const previousName = session.collection.name;
        if (previousName === targetName) return;
        session.collection.name = targetName;
        try {
          await session.collection.saveTx({ skipSelect: true });
          session.lastName = targetName;
          addon?.data?.views?.repositionCitationCollections?.();
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
        if (this._listenerStopped || this._isTickRunning) return;
        this._isTickRunning = true;
        try {
          if (!Zotero.ZoteroCitation) {
            void this.clear().catch((error) => this.logError("Failed to clear after plugin instance removal", error));
            return;
          }
          if (this._isExecCommandRunning) return;
          const sessions = Zotero.Integration.sessions || {};
          await this._pruneMissingWordSessions(sessions);
          await this._syncActiveWordSessions(sessions);
        } catch (e) {
          this.logError("Background citation synchronization failed", e);
        } finally {
          this._isTickRunning = false;
          if (!this._listenerStopped) {
            this._listenerTimer = globalThis.setTimeout(
              () => {
                this._listenerTickTask = tick();
              },
              Object.keys(this.sessions).length ? t : Math.max(t, 5e3)
            );
          }
        }
      };
      this._listenerTimer = globalThis.setTimeout(tick, t);
      this._installWordIntegrationHooks();
    }
    /**
     * Cleans up tracked sessions that have been absent from Zotero.Integration.sessions for 3 ticks.
     * @param {object} sessions - Active integration sessions map
     * @returns {Promise<void>}
     * @private
     */
    async _pruneMissingWordSessions(sessions) {
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
    }
    /**
     * Ensures collections and refreshes citations for all active Word sessions.
     * @param {object} sessions - Active integration sessions map
     * @returns {Promise<void>}
     * @private
     */
    async _syncActiveWordSessions(sessions) {
      for (const sessionID in sessions) {
        const session = sessions[sessionID];
        if (!/(WinWord|MacWord|Word)/i.test(String(session?.agent || ""))) continue;
        let tracked;
        try {
          tracked = await this.ensureSession(sessionID, session);
          if (!tracked || tracked.pending || !tracked.collection || this._listenerStopped) continue;
          await this._syncSessionDocumentName(sessionID, session, tracked);
        } catch (error) {
          this.logError("Cannot initialize a Word citation collection", error);
          continue;
        }
        if (this._listenerStopped || this._isExecCommandRunning) break;
        await this.refreshSessionCitations(sessionID, session);
      }
    }
    /**
     * Self-heals pending or window-title-derived collection names during background session sync.
     * @private
     */
    async _syncSessionDocumentName(sessionID, nativeSession, trackedSession) {
      if (this._listenerStopped || !trackedSession?.collection || trackedSession.closing) return;
      const currentDocId = this._docIdBySession?.[sessionID] || trackedSession.docId || "";
      const isWindowTitleDerived = typeof currentDocId === "string" && currentDocId.startsWith("window-title:");
      const isPending = this._isPendingCollectionName?.(trackedSession.collection.name, sessionID);
      if (!currentDocId || isPending || isWindowTitleDerived) {
        const resolvedDocId = this._resolveFallbackDocumentId?.(sessionID, nativeSession, null, false);
        if (resolvedDocId && this._getDocumentDisplayName(resolvedDocId)) {
          this._rememberSessionDocument(sessionID, resolvedDocId);
        }
      }
      const effectiveDocId = this._docIdBySession?.[sessionID] || trackedSession.docId;
      const targetName = effectiveDocId ? this._getDocumentDisplayName(effectiveDocId) : "";
      if (targetName && trackedSession.collection.name !== targetName) {
        try {
          await this._renameCollection(sessionID, targetName, effectiveDocId);
        } catch (error) {
          this.logError(`Failed to rename Word citation collection for ${sessionID}`, error);
          this._scheduleCollectionRenameRetry(sessionID, targetName, effectiveDocId);
        }
      }
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
      const originalExecCommand = this._originalExecCommand;
      const originalGetSession = Zotero.Integration.getSession;
      if (typeof originalGetSession === "function") {
        const getSessionWrapper = this._createGetSessionWrapper(originalGetSession);
        this._originalGetSession = originalGetSession;
        this._getSessionWrapper = getSessionWrapper;
        Zotero.Integration.getSession = getSessionWrapper;
      }
      const execCommandWrapper = this._createExecCommandWrapper(originalExecCommand, originalGetSession);
      this._execCommandWrapper = execCommandWrapper;
      Zotero.Integration.execCommand = execCommandWrapper;
    }
    _isMatchingWordBinding(binding, agent, command) {
      if (!binding || binding.command !== command) return false;
      if (binding.agent === agent) return true;
      return /^MacWord/i.test(String(binding.agent || "")) && /^MacWord/i.test(String(agent || ""));
    }
    /**
     * Creates an interception wrapper for Zotero.Integration.getSession to bind command sessions.
     * @param {Function} originalGetSession - Host getSession function
     * @returns {Function} Wrapped getSession function
     * @private
     */
    _createGetSessionWrapper(originalGetSession) {
      const citationModule = this;
      return async function(app, doc, agent, command) {
        const candidates = [...citationModule._execCommandBindings.values()].filter((binding2) => citationModule._isMatchingWordBinding(binding2, agent, command));
        const binding = candidates.length === 1 ? candidates[0] : null;
        const result = await originalGetSession.apply(this, arguments);
        if (!citationModule._listenerStopped && binding && !binding.ambiguous && citationModule._execCommandBindings.get(binding.bindingID) === binding) {
          const sessionObj = Array.isArray(result) ? result[0] : result;
          const sessionID = sessionObj?.sessionID;
          if (typeof sessionID === "string" && sessionID) {
            binding.sessionID = sessionID;
            binding.doc = doc;
          }
        }
        return result;
      };
    }
    /**
     * Creates an interception wrapper for Zotero.Integration.execCommand to track Word commands.
     * @param {Function} originalExecCommand - Host execCommand function
     * @param {Function} [originalGetSession] - Host getSession function
     * @returns {Function} Wrapped execCommand function
     * @private
     */
    _createExecCommandWrapper(originalExecCommand, originalGetSession) {
      const citationModule = this;
      return async function(agent, command, docId) {
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
          await citationModule._handlePostExecCommand(binding, boundBefore, originalGetSession, docId);
        } catch (error) {
          citationModule.logError("Post-command citation refresh failed", error);
        } finally {
          citationModule._execCommandBindings.delete(bindingID);
        }
        return result;
      };
    }
    /**
     * Synchronizes session document name, collection, and citations after a Word command completes.
     * @param {object} binding - Command binding record
     * @param {string|null} boundBefore - Session ID prior to command execution
     * @param {Function} [originalGetSession] - Host getSession function
     * @param {string} docId - Word document path/URI
     * @returns {Promise<void>}
     * @private
     */
    async _handlePostExecCommand(binding, boundBefore, originalGetSession, docId) {
      if (this._listenerStopped || binding.ambiguous) return;
      const integration = Zotero.Integration;
      if (!binding.sessionID && typeof originalGetSession !== "function") {
        const currentAfter = integration?.currentSession;
        const currentAfterID = typeof currentAfter?.sessionID === "string" ? currentAfter.sessionID : null;
        const sessionsAfter = Object.keys(integration?.sessions || {});
        const pendingBindings = [...this._execCommandBindings.values()].filter((candidate) => candidate.bindingID !== binding.bindingID);
        if (currentAfterID && currentAfterID !== boundBefore && pendingBindings.length === 0 && sessionsAfter.includes(currentAfterID)) {
          binding.sessionID = currentAfterID;
        }
      }
      const sessionID = binding.sessionID;
      if (!sessionID) {
        this.debugLog("[Citation execCommand] session binding unavailable; skipping collection rename");
        return;
      }
      const nativeSession = integration.sessions?.[sessionID];
      const hasExplicitDocId = typeof docId === "string" && docId.trim() !== "";
      const effectiveDocId = hasExplicitDocId ? docId : this._resolveFallbackDocumentId?.(sessionID, nativeSession, binding.doc, true) || "";
      const targetName = effectiveDocId ? this._getDocumentDisplayName(effectiveDocId) : "";
      if (targetName) {
        this._rememberSessionDocument(sessionID, effectiveDocId);
      } else if (hasExplicitDocId) {
        this._clearCollectionRenameRetry(sessionID);
        delete this._docIdBySession[sessionID];
        if (this.sessions?.[sessionID]) delete this.sessions[sessionID].docId;
        delete addon.data.docId;
      }
      this._setActiveSessionID(sessionID);
      if (targetName) addon.data.docId = effectiveDocId;
      const trackedSession = await this.ensureSession(sessionID);
      if (!trackedSession?.collection || this._listenerStopped) return;
      if (nativeSession) await this.refreshSessionCitations(sessionID, nativeSession);
      if (targetName && trackedSession.collection.name !== targetName) {
        try {
          await this._renameCollection(sessionID, targetName, effectiveDocId);
        } catch (error) {
          this.logError(`Failed to rename Word citation collection for ${sessionID}`, error);
          this._scheduleCollectionRenameRetry(sessionID, targetName, effectiveDocId);
        }
      }
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
      this._initializationTasks ??= /* @__PURE__ */ new Map();
      if (this._initializationTasks.has(sessionID)) return this._initializationTasks.get(sessionID);
      const initialDocId = this._docIdBySession[sessionID] || this._extractSessionDocumentId?.(nativeSession) || void 0;
      if (initialDocId && !this._docIdBySession[sessionID]) {
        this._rememberSessionDocument(sessionID, initialDocId);
      }
      const initialName = initialDocId ? this._getDocumentDisplayName(initialDocId) : "";
      const session = existing || {
        idData: {},
        lastName: initialName || this._getPendingCollectionName(sessionID),
        docId: initialDocId,
        pending: true
      };
      this.sessions[sessionID] = session;
      this._invalidateSessionIndex();
      const task = (async () => {
        try {
          await this.initCollection(sessionID, session);
          return !this._listenerStopped && this.sessions[sessionID] === session ? session : void 0;
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
     * Validates whether a citation index key represents a non-negative safe integer.
     * Prevents NaN comparator corruption in Array.prototype.sort.
     * @param {string} key - Object key from citationsByIndex
     * @returns {boolean}
     * @private
     */
    _isValidCitationIndexKey(key) {
      if (typeof key !== "string" || !/^\d+$/.test(key)) return false;
      const num = Number(key);
      return Number.isSafeInteger(num) && num >= 0;
    }
    /**
     * Parses and validates a positive safe integer item ID from a citation item entry.
     * @param {unknown} rawId - Raw item ID
     * @returns {number|null} Positive integer ID or null
     * @private
     */
    _parseValidItemID(rawId) {
      if (typeof rawId === "number") {
        return Number.isSafeInteger(rawId) && rawId > 0 ? rawId : null;
      }
      if (typeof rawId === "string") {
        const trimmed = rawId.trim();
        if (!/^\d+$/.test(trimmed)) return null;
        const num = Number(trimmed);
        return Number.isSafeInteger(num) && num > 0 ? num : null;
      }
      return null;
    }
    /**
     * Retrieves and validates cached sort signature and item IDs for a session.
     * @param {string} sessionID - Session identifier
     * @returns {object|undefined}
     * @private
     */
    _getSortedCache(sessionID) {
      if (!this._sortedCacheBySession || typeof this._sortedCacheBySession !== "object") return void 0;
      const key = this._getSortedCacheKey(sessionID);
      const cache = this._sortedCacheBySession[key];
      if (!cache || typeof cache.sig !== "string" || !Array.isArray(cache.result) || cache.result.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
        return void 0;
      }
      return cache;
    }
    /**
     * Caches sort signature and cloned result array for a session with bounded eviction.
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
      const maxSessions = this._maxSortedCacheSessions || 64;
      const existingKeys = Object.keys(this._sortedCacheBySession);
      if (!(key in this._sortedCacheBySession) && existingKeys.length >= maxSessions) {
        delete this._sortedCacheBySession[existingKeys[0]];
      }
      this._sortedCacheBySession[key] = { sig, result: [...result] };
    }
    /**
     * Extracts and sorts item IDs according to their exact order of appearance in the Word document.
     * @param {object} citationsByIndex - Native citation index dictionary
     * @param {string} sessionID - Session identifier
     * @returns {number[]} Sorted unique item IDs
     */
    getSortedItemIDs(citationsByIndex, sessionID) {
      const perfStart = Date.now();
      citationsByIndex ??= {};
      try {
        const indexKeys = Object.keys(citationsByIndex).filter((key) => this._isValidCitationIndexKey(key)).sort((a, b) => Number(a) - Number(b));
        const parts = [];
        const seenIDs = /* @__PURE__ */ new Set();
        const sortedItemIDs = [];
        for (const key of indexKeys) {
          const values = [];
          const items = Array.isArray(citationsByIndex[key]?.citationItems) ? citationsByIndex[key].citationItems : [];
          for (const item of items) {
            if (!item) continue;
            const id = this._parseValidItemID(item.id);
            if (id === null) continue;
            const zotItem = typeof Zotero !== "undefined" && typeof Zotero.Items?.get === "function" ? Zotero.Items.get(id) : null;
            if (zotItem && (zotItem.deleted === true || zotItem.inTrash === true)) continue;
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
      if (this._docIdBySession) delete this._docIdBySession[sessionID];
      if (this.activeSessionID === sessionID) this._setActiveSessionID(null);
      if (this._lastRefreshAt) delete this._lastRefreshAt[sessionID];
      if (this._lastTagSyncSig) delete this._lastTagSyncSig[sessionID];
      if (this._sessionCitedIDs) delete this._sessionCitedIDs[sessionID];
      if (this._tagSyncInFlightBySession) delete this._tagSyncInFlightBySession[sessionID];
      if (this._pendingTagSyncIDsBySession) delete this._pendingTagSyncIDsBySession[sessionID];
      if (this._emptyReadCountBySession) delete this._emptyReadCountBySession[sessionID];
      if (this._missingSessionCountBySession) delete this._missingSessionCountBySession[sessionID];
      this._pendingCollectionNames?.delete(sessionID);
      if (this._sessionUpdateRevision) {
        this._sessionUpdateRevision[sessionID] = (this._sessionUpdateRevision[sessionID] || 0) + 1;
      }
      if (this._sessionUpdateQueue) delete this._sessionUpdateQueue[sessionID];
      if (this._refreshRetryTimerBySession?.[sessionID]) {
        globalThis.clearTimeout(this._refreshRetryTimerBySession[sessionID]);
        delete this._refreshRetryTimerBySession[sessionID];
      }
      if (this._tagSyncTimerBySession?.[sessionID]) {
        globalThis.clearTimeout(this._tagSyncTimerBySession[sessionID]);
        delete this._tagSyncTimerBySession[sessionID];
      }
      const cacheKey = this._getSortedCacheKey(sessionID);
      if (this._sortedCacheBySession) delete this._sortedCacheBySession[cacheKey];
    }
    /**
     * Constructs a deterministic signature from an array of item IDs.
     * @param {number[]} sortedItemIDs - Array of item IDs
     * @returns {string} Comma-separated signature
     * @private
     */
    _buildCitationTagSig(sortedItemIDs) {
      if (!Array.isArray(sortedItemIDs) || sortedItemIDs.length === 0) return "";
      const uniq = Array.from(new Set(
        sortedItemIDs.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
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
      const normalizedIDs = Array.isArray(sortedItemIDs) ? sortedItemIDs.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0) : [];
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
        void syncPromise.catch((e) => {
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
      if (!item || item.libraryID !== userLibraryID || item.editable === false || item.deleted === true || item.inTrash === true) {
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
     * Checks whether an item currently carries the specified tag name.
     * @param {Zotero.Item} item - Zotero item
     * @param {string} tagName - Tag string to check
     * @returns {boolean}
     * @private
     */
    _hasItemTag(item, tagName) {
      return typeof item.hasTag === "function" ? item.hasTag(tagName) : (item.getTags?.() || []).some((tag) => (typeof tag === "string" ? tag : tag?.tag) === tagName);
    }
    /**
     * Resolves a Zotero item synchronously or asynchronously by ID.
     * @param {number} itemID - Zotero item ID
     * @returns {Promise<Zotero.Item|null>}
     * @private
     */
    async _resolveItemByID(itemID) {
      let item = Zotero.Items.get(itemID);
      if (!item && typeof Zotero.Items.getAsync === "function") {
        item = await Zotero.Items.getAsync(itemID);
      }
      return item || null;
    }
    /**
     * Collects the union of cited item IDs across all active Word sessions when tags are enabled.
     * @returns {Set<number>}
     * @private
     */
    _collectActiveCitedIDSet() {
      const activeCitedIDSet = /* @__PURE__ */ new Set();
      if (Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.enable", true) !== false) {
        const liveSessions = Zotero.Integration?.sessions;
        for (const sid in this._sessionCitedIDs) {
          if (this.sessions?.[sid]?.closing) continue;
          if (liveSessions && typeof liveSessions === "object" && Object.keys(liveSessions).length > 0 && !(sid in liveSessions) && !(sid in (this.sessions || {}))) {
            continue;
          }
          const ids = this._sessionCitedIDs[sid] || [];
          ids.forEach((id) => activeCitedIDSet.add(Number(id)));
        }
      }
      return activeCitedIDSet;
    }
    /**
     * Adds or renames the managed citation tag on a single actively cited item with rollback safety.
     * @param {Zotero.Item} item - Target Zotero item
     * @param {number} itemID - Item ID
     * @param {string} tagName - Target citation tag name
     * @returns {Promise<{ touched: boolean, skipped: boolean, ownershipChanged: boolean }>}
     * @private
     */
    async _syncActiveItemCitationTag(item, itemID, tagName) {
      let touched = false;
      let ownershipChanged = false;
      const oldName = this._managedCitationTagIDs[itemID] && (this._managedCitationTagNames[itemID] || "/Citations");
      const removeOld = oldName && oldName !== tagName && this._hasItemTag(item, oldName);
      const addNew = !this._hasItemTag(item, tagName);
      if (removeOld && typeof item.removeTag !== "function" || addNew && typeof item.addTag !== "function") {
        return { touched: false, skipped: true, ownershipChanged: false };
      }
      if (removeOld || addNew) {
        if (removeOld) item.removeTag(oldName);
        if (addNew) item.addTag(tagName);
        try {
          await item.saveTx();
          touched = true;
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
      if (addNew || oldName === tagName && this._managedCitationTagIDs[itemID]) {
        this._managedCitationTagIDs[itemID] = true;
        this._managedCitationTagNames[itemID] = tagName;
      }
      return { touched, skipped: false, ownershipChanged };
    }
    /**
     * Removes the plugin-managed citation tag from a single item that is no longer cited.
     * @param {Zotero.Item} item - Target Zotero item
     * @param {number} itemID - Item ID
     * @returns {Promise<{ touched: boolean, ownershipChanged: boolean }>}
     * @private
     */
    async _removeUncitedManagedItemTag(item, itemID) {
      let touched = false;
      const managedName = this._managedCitationTagNames[itemID] || "/Citations";
      const hasCitationTag = this._hasItemTag(item, managedName);
      if (hasCitationTag && typeof item.removeTag === "function") {
        item.removeTag(managedName);
        try {
          await item.saveTx();
          touched = true;
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
      return { touched, ownershipChanged: true };
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
      const task = previous.catch(() => {
      }).then(() => this._syncCitationTags(sessionID, sortedItemIDs));
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
     * @param {number[]} _sortedItemIDs - Cited item IDs
     * @returns {Promise<{ complete: boolean, touchedCount: number }>}
     * @private
     */
    async _syncCitationTags(sessionID, _sortedItemIDs) {
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
        const activeCitedIDSet = this._collectActiveCitedIDSet();
        for (const itemID of activeCitedIDSet) {
          if (!Number.isInteger(itemID) || itemID <= 0) continue;
          try {
            const item = await this._resolveItemByID(itemID);
            if (!item) continue;
            if (!this._isWritableCitationItem(item)) {
              if (item.libraryID === Zotero.Libraries?.userLibraryID || this._managedCitationTagIDs[itemID]) skipped = true;
              continue;
            }
            if (Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.enable", true) === false || this._citationTagName !== tagName) break;
            const res = await this._syncActiveItemCitationTag(item, itemID, tagName);
            if (res.skipped) {
              skipped = true;
              continue;
            }
            if (res.touched) touchedCount += 1;
            if (res.ownershipChanged) ownershipChanged = true;
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
        const managedIDs = Object.keys(this._managedCitationTagIDs).map((id) => Number(id));
        for (const itemID of managedIDs) {
          if (activeCitedIDSet.has(itemID)) continue;
          try {
            const item = await this._resolveItemByID(itemID);
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
            const res = await this._removeUncitedManagedItemTag(item, itemID);
            if (res.touched) touchedCount += 1;
            if (res.ownershipChanged) ownershipChanged = true;
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
        void this.refreshSessionCitations(sessionID, targetSession).catch((error) => this.logError("Failed to retry citation refresh", error));
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
      (this._activeRefreshTasks ??= /* @__PURE__ */ new Set()).add(task);
      try {
        return await task;
      } finally {
        this._activeRefreshTasks.delete(task);
      }
    }
    /**
     * Reads citationsByItemID and citationsByIndex from the native Word session,
     * retrying once on bidirectional torn-snapshot mismatch (index empty while itemMap non-empty, or vice versa).
     * @param {object} targetSession - Native Word session
     * @returns {Promise<{ citationsByItemID: object, citationsByIndex: object, transientMismatch: boolean }>}
     * @private
     */
    async _readSessionCitationSnapshots(targetSession) {
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
      const indexEmpty = Object.keys(citationsByIndex).length === 0;
      const itemMapEmpty = Object.keys(citationsByItemID).length === 0;
      if (indexEmpty !== itemMapEmpty) {
        await Zotero.Promise.delay(50);
        await targetSession.updateFromDocument?.(0);
        citationsByIndex = targetSession.citationsByIndex || {};
        citationsByItemID = targetSession.citationsByItemID || {};
        const retryIndexEmpty = Object.keys(citationsByIndex).length === 0;
        const retryItemMapEmpty = Object.keys(citationsByItemID).length === 0;
        if (retryIndexEmpty !== retryItemMapEmpty) {
          return { citationsByItemID, citationsByIndex, transientMismatch: true };
        }
      }
      return { citationsByItemID, citationsByIndex, transientMismatch: false };
    }
    /**
     * Handles empty citation index snapshots with two-read confirmation before clearing session state.
     * @param {string} sessionID - Session identifier
     * @param {object} targetSession - Native Word session
     * @param {object} citationsByItemID - Current item citation map
     * @returns {Promise<void>}
     * @private
     */
    async _handleEmptyCitationSnapshot(sessionID, targetSession, citationsByItemID) {
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
      this._refreshStateBySession ??= /* @__PURE__ */ new WeakMap();
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
      } catch {
      }
      refreshState.syncing = true;
      try {
        const { citationsByItemID, citationsByIndex, transientMismatch } = await this._readSessionCitationSnapshots(targetSession);
        if (transientMismatch) {
          this._emptyReadCountBySession[sessionID] = 0;
          this._scheduleSessionRefresh(sessionID, targetSession, 250);
          return;
        }
        if (Object.keys(citationsByIndex).length === 0) {
          await this._handleEmptyCitationSnapshot(sessionID, targetSession, citationsByItemID);
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
        const panes = Zotero.getMainWindows?.().map((win) => win.ZoteroPane) || [globalThis.ZoteroPane];
        const seenViews = /* @__PURE__ */ new Set();
        for (const pane of panes) {
          const itemsView = pane?.itemsView;
          if (!itemsView || seenViews.has(itemsView)) continue;
          seenViews.add(itemsView);
          try {
            await itemsView.refreshAndMaintainSelection();
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
          Array.isArray(values) ? values.map((value) => ({ properties: { plainCitation: value?.properties?.plainCitation } })) : values
        ]));
      }
      if (Array.isArray(sortedItemIDs)) sortedItemIDs = [...sortedItemIDs];
      const revision = (this._sessionUpdateRevision[sessionID] || 0) + 1;
      this._sessionUpdateRevision[sessionID] = revision;
      const previous = this._sessionUpdateQueue[sessionID] || Promise.resolve();
      const task = previous.catch((error) => {
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
     * Formats the plain citation label for a single item ID based on document ordinal and style class.
     * @private
     */
    _formatItemPlainCitation(id, idIndexMap, citationsByItemID, oldIdData, isNoteStyle) {
      const index = idIndexMap.get(Number(id));
      if (index === void 0) {
        return oldIdData[id]?.plainCitation || (isNoteStyle ? "—" : "—: (pending)");
      }
      const order = index + 1;
      if (isNoteStyle) return String(order);
      const citations = citationsByItemID[id] ?? citationsByItemID[Number(id)];
      if (!Array.isArray(citations) || citations.length === 0) {
        const prev = oldIdData[id]?.plainCitation || oldIdData[String(id)]?.plainCitation;
        return prev && prev.startsWith(`${order}: `) && !prev.endsWith("(error)") ? prev : `${order}: (error)`;
      }
      const labels = [];
      const seen = /* @__PURE__ */ new Set();
      for (const entry of citations) {
        const rawText = typeof entry?.properties?.plainCitation === "string" ? entry.properties.plainCitation.replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\uFEFF]/g, " ").replace(/\s+/g, " ").trim() : "";
        const cleaned = rawText || "(no text)";
        if (!seen.has(cleaned)) {
          seen.add(cleaned);
          labels.push(cleaned);
        }
      }
      return `${order}: ` + (labels.length ? labels.join(", ") : "(no text)");
    }
    /**
     * Formats item plain citations and synchronizes session collection items.
     * @private
     */
    async _applyCitations(sessionID, citationsByItemID, sortedItemIDs, styleClass, revision) {
      if (!citationsByItemID || typeof citationsByItemID !== "object" || !Array.isArray(sortedItemIDs)) return;
      const citationIDKeySet = new Set(Object.keys(citationsByItemID));
      for (const id of sortedItemIDs) {
        if (Number.isSafeInteger(Number(id)) && Number(id) > 0) citationIDKeySet.add(String(id));
      }
      const citationIDKeys = [...citationIDKeySet];
      const isNoteStyle = styleClass === "note";
      const idIndexMap = new Map(sortedItemIDs.map((id, idx) => [Number(id), idx]));
      const oldIdData = this.sessions[sessionID]?.idData || {};
      const targetData = {};
      for (const id of citationIDKeys) {
        const zotItem = typeof Zotero !== "undefined" && typeof Zotero.Items?.get === "function" ? Zotero.Items.get(Number(id)) : null;
        if (zotItem && (zotItem.deleted === true || zotItem.inTrash === true)) continue;
        try {
          targetData[id] = { plainCitation: this._formatItemPlainCitation(id, idIndexMap, citationsByItemID, oldIdData, isNoteStyle) };
        } catch {
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
      const collectionLibraryID = citationSession.collection?.libraryID ?? Zotero.Libraries.userLibraryID;
      const targetIDs = citationIDKeys.map(Number).filter((id) => {
        if (!Number.isSafeInteger(id) || id <= 0) return false;
        const item = Zotero.Items.get(id);
        if (!item || item.libraryID !== collectionLibraryID || item.deleted === true || item.inTrash === true) return false;
        return typeof item.isTopLevelItem !== "function" || item.isTopLevelItem();
      });
      if (this._sessionUpdateRevision[sessionID] !== revision) return;
      await this.syncCollectionItems(citationSession, targetIDs);
      if (this._listenerStopped || citationSession.closing || this._sessionUpdateRevision[sessionID] !== revision || this.sessions?.[sessionID] !== citationSession) {
        return;
      }
      if (hasChanges) {
        citationSession.idData = targetData;
        this._invalidateSessionIndex();
        this.scheduleItemsViewRefresh();
      }
    }
    /**
     * Idempotently initiates citation coordinator teardown.
     * @returns {Promise<void>}
     */
    clear() {
      if (!this._clearPromise) this._clearPromise = this._performClear();
      return this._clearPromise;
    }
    /**
     * Restores Zotero.Integration.getSession and execCommand wrappers during shutdown.
     * @private
     */
    _restoreWordIntegrationHooks() {
      if (this._getSessionWrapper && Zotero.Integration.getSession === this._getSessionWrapper) {
        Zotero.Integration.getSession = this._originalGetSession;
      }
      this._getSessionWrapper = null;
      this._originalGetSession = null;
      if (this._isExecCommandHooked && this._originalExecCommand && Zotero.Integration.execCommand === this._execCommandWrapper) {
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
    }
    /**
     * Clears all internal tracking caches, timer maps, and session records after teardown.
     * @private
     */
    _resetInternalTrackingMaps() {
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
        this._pendingCollectionNames?.clear?.();
        this._pendingCollectionNumber = 0;
        this._execCommandBindings.clear();
        this._collectionRenameRetryTimerBySession = {};
        this._collectionRenameRetryCountBySession = {};
        for (const sessionID in this._refreshRetryTimerBySession) {
          globalThis.clearTimeout(this._refreshRetryTimerBySession[sessionID]);
        }
        this._refreshRetryTimerBySession = {};
      } catch {
      }
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
      this._restoreWordIntegrationHooks();
      for (const sessionID of Object.keys(this._collectionRenameRetryTimerBySession || {})) {
        this._clearCollectionRenameRetry(sessionID);
      }
      if (this._listenerTimer) {
        globalThis.clearTimeout(this._listenerTimer);
        this._listenerTimer = null;
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
      const tagTasks = [...Object.values(this._tagSyncInFlightBySession), this._tagSyncQueue].filter((t) => t && typeof t.then === "function");
      if (tagTasks.length) await Promise.allSettled(tagTasks);
      this._sessionCitedIDs = {};
      try {
        await this.syncCitationTags("__shutdown__", []);
      } catch (error) {
        this.logError("Failed to remove managed citation tags during shutdown", error);
      }
      const sessionIDs = Object.keys(this.sessions || {});
      const cleanupResults = await Promise.allSettled(sessionIDs.map((id) => this.clearSession(id, true)));
      for (const result of cleanupResults) {
        if (result.status === "rejected") {
          this.logError("Failed to remove a Word citation collection during shutdown", result.reason);
        }
      }
      this._resetInternalTrackingMaps();
    }
  };

  // src/modules/drop-target.mjs
  var cachedCtypes = null;
  function getDropTargetCtypes() {
    if (cachedCtypes) return cachedCtypes;
    const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
    const POINT = new ctypes.StructType("CiteFlowDropPoint", [
      { x: ctypes.long },
      { y: ctypes.long }
    ]);
    const user32 = ctypes.open("user32.dll");
    const kernel32 = ctypes.open("kernel32.dll");
    cachedCtypes = {
      ctypes,
      POINT,
      user32,
      kernel32,
      getCursorPos: user32.declare(
        "GetCursorPos",
        ctypes.winapi_abi,
        ctypes.int32_t,
        POINT.ptr
      ),
      windowFromPoint: user32.declare(
        "WindowFromPoint",
        ctypes.winapi_abi,
        ctypes.voidptr_t,
        POINT
      ),
      getWindowThreadProcessId: user32.declare(
        "GetWindowThreadProcessId",
        ctypes.winapi_abi,
        ctypes.uint32_t,
        ctypes.voidptr_t,
        ctypes.uint32_t.ptr
      ),
      openProcess: kernel32.declare(
        "OpenProcess",
        ctypes.winapi_abi,
        ctypes.voidptr_t,
        ctypes.uint32_t,
        ctypes.int32_t,
        ctypes.uint32_t
      ),
      queryFullProcessImageName: kernel32.declare(
        "QueryFullProcessImageNameW",
        ctypes.winapi_abi,
        ctypes.int32_t,
        ctypes.voidptr_t,
        ctypes.uint32_t,
        ctypes.jschar.ptr,
        ctypes.uint32_t.ptr
      ),
      closeHandle: kernel32.declare(
        "CloseHandle",
        ctypes.winapi_abi,
        ctypes.int32_t,
        ctypes.voidptr_t
      ),
      getAncestor: user32.declare(
        "GetAncestor",
        ctypes.winapi_abi,
        ctypes.voidptr_t,
        ctypes.voidptr_t,
        ctypes.uint32_t
      ),
      getForegroundWindow: user32.declare(
        "GetForegroundWindow",
        ctypes.winapi_abi,
        ctypes.voidptr_t
      ),
      findWindowEx: user32.declare(
        "FindWindowExW",
        ctypes.winapi_abi,
        ctypes.voidptr_t,
        ctypes.voidptr_t,
        ctypes.voidptr_t,
        ctypes.jschar.ptr,
        ctypes.voidptr_t
      ),
      isWindowVisible: user32.declare(
        "IsWindowVisible",
        ctypes.winapi_abi,
        ctypes.int32_t,
        ctypes.voidptr_t
      ),
      getWindowText: user32.declare(
        "GetWindowTextW",
        ctypes.winapi_abi,
        ctypes.int32_t,
        ctypes.voidptr_t,
        ctypes.jschar.ptr,
        ctypes.int32_t
      ),
      pathBuffer: ctypes.jschar.array(32768)(),
      titleBuffer: ctypes.jschar.array(1024)()
    };
    return cachedCtypes;
  }
  function readWindowTitle(api, hwnd) {
    if (!hwnd || hwnd.isNull()) return "";
    const len = api.getWindowText(hwnd, api.titleBuffer, api.titleBuffer.length);
    return len > 0 ? api.titleBuffer.readString() : "";
  }
  function isWinWordWindow(api, hwnd) {
    if (!hwnd || hwnd.isNull()) return false;
    let processHandle;
    try {
      const processID = api.ctypes.uint32_t();
      if (!api.getWindowThreadProcessId(hwnd, processID.address()) || !processID.value) return false;
      processHandle = api.openProcess(4096, false, processID.value);
      if (processHandle.isNull()) return false;
      const pathLength = api.ctypes.uint32_t(api.pathBuffer.length);
      if (!api.queryFullProcessImageName(processHandle, 0, api.pathBuffer, pathLength.address())) return false;
      return api.pathBuffer.readString().split(/[\\/]/).pop().toLowerCase() === "winword.exe";
    } catch {
      return false;
    } finally {
      if (processHandle && !processHandle.isNull()) try {
        api.closeHandle(processHandle);
      } catch {
      }
    }
  }
  function closeDropTargetCtypes() {
    if (!cachedCtypes) return;
    const { user32, kernel32 } = cachedCtypes;
    cachedCtypes = null;
    try {
      kernel32?.close();
    } catch {
    }
    try {
      user32?.close();
    } catch {
    }
  }
  function probeWordWindowTitles() {
    if (typeof Zotero === "undefined" || !Zotero.isWin) return { foregroundTitle: "", visibleTitles: [] };
    try {
      const api = getDropTargetCtypes();
      let foregroundTitle = "";
      const fg = api.getForegroundWindow();
      if (fg && !fg.isNull()) {
        const rootFg = api.getAncestor(fg, 2);
        const targetFg = rootFg && !rootFg.isNull() ? rootFg : fg;
        if (isWinWordWindow(api, targetFg)) {
          foregroundTitle = readWindowTitle(api, targetFg);
        }
      }
      const visibleTitles = [];
      let current = null;
      for (let i = 0; i < 32; i++) {
        current = api.findWindowEx(null, current, "OpusApp", null);
        if (!current || current.isNull()) break;
        if (!api.isWindowVisible(current)) continue;
        const title = readWindowTitle(api, current);
        if (title) visibleTitles.push(title);
      }
      return { foregroundTitle, visibleTitles };
    } catch {
      return { foregroundTitle: "", visibleTitles: [] };
    }
  }
  function resolveWordDropTarget() {
    if (!Zotero.isWin) return "unknown";
    let processHandle;
    let closeHandle;
    try {
      const api = getDropTargetCtypes();
      closeHandle = api.closeHandle;
      const point = api.POINT();
      if (!api.getCursorPos(point.address())) return "unknown";
      const targetWindow = api.windowFromPoint(point);
      if (targetWindow.isNull()) return "unknown";
      const processID = api.ctypes.uint32_t();
      if (!api.getWindowThreadProcessId(targetWindow, processID.address()) || !processID.value) return "unknown";
      processHandle = api.openProcess(4096, false, processID.value);
      if (processHandle.isNull()) return "unknown";
      const pathLength = api.ctypes.uint32_t(api.pathBuffer.length);
      if (!api.queryFullProcessImageName(processHandle, 0, api.pathBuffer, pathLength.address())) return "unknown";
      const executable = api.pathBuffer.readString().split(/[\\/]/).pop().toLowerCase();
      const isWord = executable === "winword.exe";
      if (isWord) {
        try {
          const rootWindow = api.getAncestor(targetWindow, 2);
          const title = readWindowTitle(api, rootWindow) || readWindowTitle(api, targetWindow);
          if (title && typeof addon !== "undefined" && addon?.data) {
            addon.data.lastDroppedWordWindow = { title, at: Date.now() };
          }
        } catch {
        }
      }
      return isWord ? "word-confirmed" : "non-word";
    } catch (error) {
      return "unknown";
    } finally {
      if (processHandle && closeHandle) try {
        closeHandle(processHandle);
      } catch {
      }
    }
  }

  // src/modules/views/icon-patch.mjs
  var TEMP_COLLECTION_RELATION2 = "dc:relation";
  var TEMP_COLLECTION_MARKERS = /* @__PURE__ */ new Set([
    "https://github.com/groele/Zotero-CiteFlow#temporary-collection",
    "https://github.com/MuiseDestiny/zotero-citation#temporary-collection"
  ]);

  // src/modules/views.mjs
  var Views = class {
    /**
     * Initializes view coordinator for a Zotero window.
     * @param {Window|null} [win=null] - Optional specific window instance
     */
    constructor(win = null) {
      this._window = win;
      this._patchDisposers = [];
      this._disposed = false;
      this._dragItems = null;
      this._dragEndHandler = null;
      this._lastUnknownDropNotice = 0;
      this._registeredColumnKeys = /* @__PURE__ */ new Set();
      this._iconNodeStates = /* @__PURE__ */ new Map();
    }
    /**
     * Resolves the active ZoteroPane instance.
     * @type {object}
     */
    get pane() {
      return this._window?.ZoteroPane ?? Zotero.getActiveZoteroPane?.() ?? globalThis.ZoteroPane;
    }
    /**
     * Resolves the active document instance.
     * @type {Document}
     */
    get document() {
      return this._window?.document ?? globalThis.document;
    }
    /**
     * Resolves the active window instance.
     * @type {Window}
     */
    get window() {
      return this._window ?? Zotero.getMainWindow?.() ?? globalThis.window;
    }
    /**
     * Registers the "citation" column with Zotero.ItemTreeManager.
     * @returns {Promise<void>}
     */
    async createCitationColumn() {
      if (this._disposed) {
        return;
      }
      const key = "citation";
      const registered = await Zotero.ItemTreeManager.registerColumns({
        dataKey: key,
        label: getString(`column-${key}`),
        zoteroPersist: ["width", "hidden", "sortDirection"],
        dataProvider: (item) => this.getCitationText(item.id),
        renderCell: (index, data, column, isFirstColumn, doc = this.document) => {
          const span = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
          span.style.pointerEvents = "auto";
          if (!column) {
            return span;
          }
          span.className = `cell ${column.className}`;
          if (data == "") {
            return span;
          } else {
            span.innerText = data ?? "";
            return span;
          }
        },
        pluginID: config.addonID
      });
      const registeredKeys = Array.isArray(registered) ? registered : [registered];
      for (const registeredKey of registeredKeys) {
        if (typeof registeredKey === "string" && registeredKey) {
          this._registeredColumnKeys ??= /* @__PURE__ */ new Set();
          this._registeredColumnKeys.add(registeredKey);
        }
      }
      if (this._disposed || addon.data.alive === false) {
        await this._unregisterCitationColumns();
      }
    }
    /**
     * Unregisters all tracked citation columns asynchronously.
     * @returns {Promise<void>}
     * @private
     */
    async _unregisterCitationColumns() {
      const keys = [...this._registeredColumnKeys || []];
      this._registeredColumnKeys?.clear();
      if (!keys.length) return this._columnCleanup;
      const previous = this._columnCleanup;
      this._columnCleanup = (async () => {
        if (previous) await previous;
        try {
          const manager = Zotero.ItemTreeManager;
          if (typeof manager.unregisterColumns === "function") await manager.unregisterColumns(keys);
          else if (typeof manager.unregisterColumn === "function") await Promise.all(keys.map((key) => manager.unregisterColumn(key)));
        } catch (error) {
          Zotero.logError(error);
        }
      })();
      return this._columnCleanup;
    }
    /**
     * Disposes the view coordinator, listeners, patched nodes, and registered columns.
     * @returns {Promise<void>}
     */
    dispose() {
      this._disposed = true;
      this._dragItems = null;
      const cleanup = (action) => {
        try {
          action();
        } catch (error) {
          (Zotero?.logError || runtime?.log || console.error)(error);
        }
      };
      if (this._dragEndHandler) cleanup(() => this.document.removeEventListener("dragend", this._dragEndHandler, true));
      this._dragEndHandler = null;
      for (const [iconNode, state] of this._iconNodeStates || []) {
        cleanup(() => this._restoreIconNode(iconNode, state));
      }
      this._iconNodeStates?.clear();
      this._index = null;
      for (const restore of this._patchDisposers || []) cleanup(restore);
      this._patchDisposers = [];
      const pending = this._unregisterCitationColumns();
      this._window = null;
      return pending;
    }
    /**
     * Computes an indexed lookup cache from collection keys and item IDs to active sessions.
     * Invalidation is governed by api.sessionRevision.
     * @param {object} api - Coordinator API object
     * @returns {object} Indexed session cache
     * @private
     */
    _getSessionIndex(api) {
      const sessions = api.sessions || {};
      const revision = api.sessionRevision;
      if (Number.isSafeInteger(revision) && this._index?.sessions === sessions && this._index.revision === revision) {
        return this._index;
      }
      const index = { sessions, revision, byKey: /* @__PURE__ */ new Map(), byItem: /* @__PURE__ */ new Map() };
      for (const session of Object.values(sessions)) {
        const key = session?.collection?.key;
        if (key) {
          const matches = index.byKey.get(key) || [];
          matches.push(session);
          index.byKey.set(key, matches);
        }
        for (const id of Object.keys(session?.idData || {})) {
          const numericId = Number(id);
          if (!Number.isSafeInteger(numericId) || numericId <= 0) continue;
          const matches = index.byItem.get(numericId) || [];
          matches.push(session);
          index.byItem.set(numericId, matches);
        }
      }
      this._index = index;
      return index;
    }
    /**
     * Resolves active Word sessions corresponding to currently selected Zotero collections.
     * @param {object} index - Session lookup index
     * @returns {Set<object>} Matching Word sessions
     * @private
     */
    _resolveSelectedCollectionSessions(index) {
      const pane = this.pane;
      const getSelected = pane?.getSelectedCollections || pane?.collectionsView?.getSelectedCollections;
      let selected = [];
      try {
        if (getSelected) selected = getSelected.call(pane.getSelectedCollections ? pane : pane.collectionsView) || [];
      } catch (error) {
        runtime.log("Cannot resolve citation collection selection", error);
      }
      const wordSessions = /* @__PURE__ */ new Set();
      for (const collection of selected) {
        let candidates = index.byKey.get(collection?.key) || [];
        if (collection.libraryID == null && candidates.length !== 1) continue;
        if (collection.libraryID != null) {
          candidates = candidates.filter((session) => session.collection.libraryID == null || session.collection.libraryID === collection.libraryID);
        }
        for (const session of candidates) wordSessions.add(session);
      }
      return wordSessions;
    }
    /**
     * Resolves the formatted plain citation text for a library item.
     * Prioritizes selected collections, then active Word session, then unique item match.
     * @param {number|string} itemID - Zotero item ID
     * @returns {string} Formatted citation string or empty string
     */
    getCitationText(itemID) {
      try {
        const numericID = Number(itemID);
        if (!Number.isSafeInteger(numericID) || numericID <= 0) return "";
        const api = Zotero.ZoteroCitation?.api || {};
        const index = this._getSessionIndex(api);
        const wordSessions = this._resolveSelectedCollectionSessions(index);
        if (wordSessions.size) {
          const matches2 = [...wordSessions].filter((session) => session.idData?.[numericID] || session.idData?.[itemID]);
          if (matches2.length !== 1) return "";
          const entry2 = matches2[0].idData[numericID] ?? matches2[0].idData[itemID];
          return entry2?.plainCitation || "";
        }
        const currentSessionID = Zotero.Integration.currentSession?.sessionID;
        const active = api.activeSessionID && index.sessions[api.activeSessionID] ? api.activeSessionID : currentSessionID && index.sessions[currentSessionID] ? currentSessionID : null;
        if (active) {
          const activeSession = index.sessions[active];
          const entry2 = activeSession?.idData?.[numericID] ?? activeSession?.idData?.[itemID];
          return entry2?.plainCitation || "";
        }
        const matches = index.byItem.get(numericID) || [];
        if (matches.length !== 1) return "";
        const entry = matches[0].idData[numericID] ?? matches[0].idData[itemID];
        return entry?.plainCitation || "";
      } catch (error) {
        runtime.log("Citation column lookup failed", error);
        return "";
      }
    }
    /**
     * Retrieves column metadata from the active itemsView for CiteFlow keys.
     * @param {string} dataKey - Column data key
     * @returns {object|null} Column metadata or null
     */
    getColumnInfo(dataKey) {
      try {
        const columns = typeof this.pane.itemsView._getColumns === "function" ? this.pane.itemsView._getColumns() : typeof this.pane.itemsView.getColumns === "function" ? this.pane.itemsView.getColumns() : this.pane.itemsView._columns || [];
        const ownedKeys = /* @__PURE__ */ new Set([
          dataKey,
          `${config.addonID}-${dataKey}`,
          `zoterocitation@polygon.org-${dataKey}`,
          ...this._registeredColumnKeys || [],
          ...addon.data.views?._registeredColumnKeys || []
        ]);
        const columnInfo = columns.find((i) => typeof i?.dataKey === "string" && ownedKeys.has(i.dataKey));
        return columnInfo;
      } catch {
        return null;
      }
    }
    /**
     * Prepares the window itemsView by awaiting load, sort context, and patching _resetColumns.
     * @returns {Promise<void>}
     */
    async prepareWindow() {
      for (let attempt = 0; !this.pane?.itemsView && attempt < 200; attempt++) {
        if (this._disposed || addon.data.alive === false || this.window?.closed) return;
        await Zotero.Promise.delay(50);
      }
      if (this._disposed || addon.data.alive === false || this.window?.closed) return;
      const itemsView = this.pane?.itemsView;
      if (!itemsView) throw new Error("Zotero item tree did not initialize");
      await itemsView.waitForLoad?.();
      for (let attempt = 0; Array.isArray(itemsView.collectionTreeRows) && !itemsView.collectionTreeRows.length && attempt < 200; attempt++) {
        if (this._disposed || addon.data.alive === false || this.window?.closed) return;
        await Zotero.Promise.delay(50);
      }
      if (Array.isArray(itemsView.collectionTreeRows) && !itemsView.collectionTreeRows.length) {
        throw new Error("Zotero item tree collection context did not initialize");
      }
      await itemsView._ensureSortContextReady?.();
      await itemsView._refreshPromise;
      if (this._disposed || addon.data.alive === false || this.window?.closed) return;
      if (this._columnResetGuard || typeof itemsView._resetColumns !== "function") return;
      const restore = runtime.patch(itemsView, "_resetColumns", config.addonRef, (original) => function(...args) {
        if (!this.tree) {
          this._columnsId = null;
          return new Promise((resolve, reject) => this.forceUpdate(async () => {
            try {
              await this.tree?._resetColumns();
              resolve();
            } catch (error) {
              reject(error);
            }
          }));
        }
        return Reflect.apply(original, this, args);
      });
      this._columnResetGuard = true;
      this._patchDisposers.push(restore);
    }
    /**
     * Checks whether drag-to-cite feature is enabled and active.
     * @returns {boolean}
     * @private
     */
    _dragEnabled() {
      return !this._disposed && addon.data.alive !== false && Zotero.Prefs.get("extensions.zotero.zoterocitation.dragCite.enable", true) !== false;
    }
    /**
     * Probes the native process under cursor to determine if the target is Microsoft Word.
     * @returns {"word-confirmed"|"non-word"|"unknown"}
     * @private
     */
    _resolveDropTarget() {
      return resolveWordDropTarget();
    }
    /**
     * Displays a transient notice when a drop target cannot be confirmed as Word.
     * @private
     */
    _notifyUnknownDropTarget() {
      const now = Date.now();
      if (now - this._lastUnknownDropNotice < 15e3) return;
      this._lastUnknownDropNotice = now;
      try {
        const notice = new Zotero.ProgressWindow();
        notice.changeHeadline(getString("drag-target-unknown"));
        notice.show();
        notice.startCloseTimer(5e3);
      } catch (error) {
        Zotero.logError(error);
      }
    }
    /**
     * Installs drag-and-drop citation handler for Microsoft Word.
     * @returns {Promise<void>}
     */
    async dragCite() {
      if (this._dragEndHandler || this._disposed || addon.data.alive === false || Zotero.Prefs.get("extensions.zotero.zoterocitation.dragCite.enable", true) === false) return;
      this._dragEndHandler = (event) => {
        const items = this._dragItems;
        const startedAt = this._dragStartedAt || 0;
        this._dragItems = null;
        this._dragStartedAt = 0;
        if (!items?.length || !this._dragEnabled() || !event.dataTransfer || event.dataTransfer.mozUserCancelled) return;
        if (startedAt > 0 && Date.now() - startedAt > 6e4) return;
        const target = this._resolveDropTarget();
        if (target === "unknown") this._notifyUnknownDropTarget();
        if (target !== "word-confirmed") return;
        const validItems = items.filter((item) => item && item.deleted !== true && item.inTrash !== true && item.isRegularItem?.() && item.isTopLevelItem() && Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0);
        if (!validItems.length) return;
        void addon.api.citeItems(validItems).catch((error) => Zotero.logError(error));
      };
      this.document.addEventListener("dragend", this._dragEndHandler, true);
      try {
        const restore = runtime.patch(
          this.pane.itemsView,
          "onDragStart",
          config.addonRef,
          (original) => (event, row) => {
            this._dragItems = null;
            this._dragStartedAt = 0;
            const selection = this.pane.itemsView.selection;
            if (this._dragEnabled() && Number.isInteger(row) && selection && !selection.isSelected(row)) selection.select(row);
            const items = this.pane.getSelectedItems();
            if (this._dragEnabled() && event.dataTransfer && items?.length && items.every((item) => item && item.deleted !== true && item.inTrash !== true && item.isRegularItem?.() && item.isTopLevelItem())) {
              const seenIDs = /* @__PURE__ */ new Set();
              this._dragItems = items.filter((item) => {
                if (item.id != null) {
                  if (seenIDs.has(item.id)) return false;
                  seenIDs.add(item.id);
                }
                return true;
              });
              this._dragStartedAt = Date.now();
              event.dataTransfer.setData("text/plain", "");
              return;
            }
            return original.call(this.pane.itemsView, event, row);
          }
        );
        if (typeof restore === "function") (this._patchDisposers ??= []).push(restore);
      } catch (error) {
        this.document.removeEventListener("dragend", this._dragEndHandler, true);
        this._dragEndHandler = null;
        throw error;
      }
    }
    /**
     * Determines whether a Zotero collection reference is a CiteFlow temporary Word collection.
     * @private
     */
    _isCitationCollection(rowRef) {
      if (!rowRef || typeof rowRef !== "object") return false;
      if (rowRef._isCiteFlowCollection === true) return true;
      const key = rowRef.key;
      if (typeof key === "string" && key) {
        if (addon?.data?.citation?._temporaryCollectionKeys?.has?.(key)) return true;
        const candidates = this._getSessionIndex?.(Zotero.ZoteroCitation?.api || {})?.byKey?.get?.(key) || [];
        if (candidates.some((s) => s?.collection?.libraryID == null || rowRef.libraryID == null || s.collection.libraryID === rowRef.libraryID)) {
          return true;
        }
      }
      try {
        const relations = rowRef.getRelationsByPredicate?.(TEMP_COLLECTION_RELATION2) || [];
        if (Array.isArray(relations) && relations.some((rel) => TEMP_COLLECTION_MARKERS.has(rel))) return true;
      } catch {
      }
      return false;
    }
    /**
     * Checks whether a CollectionTreeRow is a bottom virtual library row (starting at My Publications).
     * @private
     */
    _isBottomVirtualRow(treeRow) {
      if (!treeRow || typeof treeRow !== "object") return false;
      const t = treeRow.type;
      return t === "publications" || t === "duplicates" || t === "unfiled" || t === "retracted" || t === "trash" || Boolean(treeRow.isPublications?.() || treeRow.isDuplicates?.() || treeRow.isUnfiled?.() || treeRow.isRetracted?.() || treeRow.isTrash?.());
    }
    /**
     * Compares two collection names using Zotero's locale collator.
     * @private
     */
    _compareCollectionNames(nameA, nameB) {
      const a = String(nameA ?? ""), b = String(nameB ?? "");
      return typeof Zotero?.localeCompare === "function" ? Zotero.localeCompare(a, b) : a.localeCompare(b);
    }
    /**
     * Reorders CiteFlow temporary Word collection rows within a library slice so they appear
     * after all regular user collections/searches and immediately above My Publications.
     * @private
     */
    _reorderCitationRowsInSlice(rows, startIndex, endIndex, targetLevel) {
      if (!Array.isArray(rows) || startIndex < 0 || endIndex <= startIndex || endIndex > rows.length) return false;
      const beforeBlocks = [], citationBlocks = [], afterBlocks = [];
      let i = startIndex, reachedBottomVirtual = false;
      while (i < endIndex) {
        const head = rows[i], block = [head];
        i += 1;
        while (i < endIndex && (rows[i]?.level ?? targetLevel) > targetLevel) {
          block.push(rows[i]);
          i += 1;
        }
        const isCitation = Boolean((head?.isCollection?.() || head?.type === "collection") && this._isCitationCollection(head?.ref));
        if (isCitation) citationBlocks.push(block);
        else if (reachedBottomVirtual || this._isBottomVirtualRow(head)) {
          reachedBottomVirtual = true;
          afterBlocks.push(block);
        } else beforeBlocks.push(block);
      }
      if (!citationBlocks.length) return false;
      citationBlocks.sort((a, b) => this._compareCollectionNames(a[0]?.ref?.name, b[0]?.ref?.name));
      const reordered = [...beforeBlocks.flat(), ...citationBlocks.flat(), ...afterBlocks.flat()];
      if (reordered.length !== endIndex - startIndex) return false;
      let changed = false;
      for (let k = 0; k < reordered.length; k++) {
        if (rows[startIndex + k] !== reordered[k]) {
          changed = true;
          break;
        }
      }
      if (!changed) return false;
      rows.splice(startIndex, endIndex - startIndex, ...reordered);
      return true;
    }
    /**
     * Enumerates all unique active collectionsView instances across main and detached windows.
     * @private
     */
    _getAllCollectionsViews() {
      const views = new Set([this.pane?.collectionsView].filter(Boolean));
      if (typeof Zotero?.getMainWindows === "function") {
        for (const win of Zotero.getMainWindows()) {
          const cv = win?.ZoteroPane?.collectionsView;
          if (cv) views.add(cv);
        }
      }
      return views;
    }
    /**
     * Reorders Word collections in a single collectionsView instance.
     * @private
     */
    _reorderViewCollections(cv) {
      const rows = cv?._rows;
      if (!cv || !Array.isArray(rows) || !rows.length) return false;
      const focusedID = cv.getRow?.(cv.selection?.focused)?.id;
      const pivotID = cv.getRow?.(cv.selection?.pivot)?.id;
      const selectedIDs = cv.selection?.selected instanceof Set ? [...cv.selection.selected].map((idx) => cv.getRow?.(idx)?.id).filter(Boolean) : [];
      let anyChanged = false, i = 0;
      while (i < rows.length) {
        const row = rows[i];
        const isLib = Boolean(row?.isLibrary?.(true) || row?.type === "library" || row?.type === "group");
        if (isLib && (typeof cv.isContainerOpen !== "function" || cv.isContainerOpen(i))) {
          const libLevel = typeof cv.getLevel === "function" ? cv.getLevel(i) : row.level ?? 0;
          let endIndex = i + 1;
          while (endIndex < rows.length) {
            const nextLevel = typeof cv.getLevel === "function" ? cv.getLevel(endIndex) : rows[endIndex]?.level ?? 0;
            if (nextLevel <= libLevel) break;
            endIndex += 1;
          }
          if (this._reorderCitationRowsInSlice(rows, i + 1, endIndex, libLevel + 1)) anyChanged = true;
          i = endIndex;
        } else {
          i += 1;
        }
      }
      if (!anyChanged) return false;
      cv._refreshRowMap?.();
      if (cv.selection && cv._rowMap) {
        if (focusedID && typeof cv._rowMap[focusedID] === "number") cv.selection.focused = cv._rowMap[focusedID];
        if (pivotID && typeof cv._rowMap[pivotID] === "number") cv.selection.pivot = cv._rowMap[pivotID];
        if (cv.selection.selected instanceof Set && selectedIDs.length) {
          cv.selection.selected = new Set(selectedIDs.map((id) => cv._rowMap[id]).filter((idx) => typeof idx === "number"));
        }
      }
      cv.tree?.invalidate?.();
      return true;
    }
    /**
     * Repositions active CiteFlow Word collection rows across all open views to sit right above My Publications.
     */
    repositionCitationCollections() {
      if (this._disposed || addon?.data?.alive === false) return false;
      let anyChanged = false;
      for (const cv of this._getAllCollectionsViews()) {
        if (this._reorderViewCollections(cv)) anyChanged = true;
      }
      return anyChanged;
    }
    /**
     * Inserts a CiteFlow temporary Word collection row immediately above My Publications in collectionsView.
     * @private
     */
    _insertCitationRowAbovePublications(cv, col) {
      const startRow = cv._rowMap?.["L" + col.libraryID];
      if (startRow === void 0 || typeof cv.isContainerOpen === "function" && !cv.isContainerOpen(startRow)) return false;
      const libLevel = typeof cv.getLevel === "function" ? cv.getLevel(startRow) : cv._rows?.[startRow]?.level ?? 0;
      const level = libLevel + 1;
      let beforeRow = startRow + 1;
      if (typeof cv.isContainerEmpty !== "function" || !cv.isContainerEmpty(startRow)) {
        for (let i = startRow + 1; i < (cv._rows?.length || 0); i++) {
          const rowLevel = typeof cv.getLevel === "function" ? cv.getLevel(i) : cv._rows[i]?.level ?? 0;
          if (rowLevel < level) {
            beforeRow = i;
            break;
          }
          if (rowLevel === level) {
            const treeRow = cv.getRow(i);
            if (this._isBottomVirtualRow(treeRow)) {
              beforeRow = i;
              break;
            }
            if ((treeRow?.isCollection?.() || treeRow?.type === "collection") && this._isCitationCollection(treeRow.ref) && this._compareCollectionNames(treeRow.ref?.name, col.name) > 0) {
              beforeRow = i;
              break;
            }
          }
          beforeRow = i + 1;
        }
      }
      if (typeof cv._includedInTree !== "function" || cv._includedInTree(col)) {
        cv._addRow(new Zotero.CollectionTreeRow(cv, "collection", col, level), beforeRow);
      }
      return beforeRow;
    }
    /**
     * Patches collectionsView.renderItem, _expandRow, and _addSortedRow to display the Word icon
     * and position CiteFlow temporary collections immediately above My Publications.
     */
    async patchIcon() {
      try {
        const view = this;
        const cv = this.pane?.collectionsView;
        if (!cv) return;
        const restoreRender = runtime.patch(cv, "renderItem", config.addonRef, (original) => (index, selection, oldDiv, columns) => {
          const previousIcon = oldDiv?.querySelector?.(".cell-icon");
          if (previousIcon) {
            view._restoreIconNode(previousIcon);
            view._iconNodeStates?.delete(previousIcon);
          }
          const div = original.call(cv, index, selection, oldDiv, columns);
          if (view._disposed || addon.data.alive === false) return div;
          const row = cv.getRow(index);
          const isCitationCollection = view._isCitationCollection(row?.ref);
          const iconNode = div?.querySelector?.(".cell-icon");
          if (iconNode && isCitationCollection) {
            view._rememberIconNode(iconNode);
            iconNode.style.backgroundImage = `url(chrome://${config.addonRef}/content/icons/word.png)`;
            iconNode.classList.remove("icon-search", "icon-collection");
            iconNode.classList.add("icon-publications");
          } else if (iconNode) {
            view._restoreIconNode(iconNode);
            view._iconNodeStates?.delete(iconNode);
          }
          return div;
        });
        if (typeof restoreRender === "function") (this._patchDisposers ??= []).push(restoreRender);
        if (typeof cv._expandRow === "function") {
          const restoreExpand = runtime.patch(cv, "_expandRow", config.addonRef, (original) => async function(rows, row, forceOpen) {
            const added = await original.call(this, rows, row, forceOpen);
            if (!view._disposed && addon.data.alive !== false && added > 0 && rows?.[row]?.isLibrary?.(true)) {
              const libLevel = typeof this.getLevel === "function" && rows === this._rows ? this.getLevel(row) : rows[row]?.level ?? 0;
              if (view._reorderCitationRowsInSlice(rows, row + 1, row + 1 + added, libLevel + 1)) {
                this._refreshRowMap?.();
                this.tree?.invalidate?.();
              }
            }
            return added;
          });
          if (typeof restoreExpand === "function") (this._patchDisposers ??= []).push(restoreExpand);
        }
        if (typeof cv._addSortedRow === "function") {
          const restoreAddSorted = runtime.patch(cv, "_addSortedRow", config.addonRef, (original) => async function(objectType, id) {
            if (view._disposed || addon.data.alive === false) return original.call(this, objectType, id);
            if (objectType === "collection") {
              const col = Zotero.Collections?.get?.(id) || await Zotero.Collections?.getAsync?.(id);
              if (col && !col.parentID && view._isCitationCollection(col)) {
                return view._insertCitationRowAbovePublications(this, col);
              }
            }
            const maskedRows = [];
            for (const row of this._rows || []) {
              if ((row?.isCollection?.() || row?.type === "collection") && view._isCitationCollection(row?.ref)) {
                row.isCollection = () => false;
                maskedRows.push(row);
              }
            }
            try {
              return await original.call(this, objectType, id);
            } finally {
              for (const row of maskedRows) delete row.isCollection;
            }
          });
          if (typeof restoreAddSorted === "function") (this._patchDisposers ??= []).push(restoreAddSorted);
        }
        this.repositionCitationCollections();
      } catch (error) {
        runtime.log("[Views] Failed to patch citation collection icon:", error);
      }
    }
    /**
     * Caches original visual properties of an icon DOM node before patching.
     * @private
     */
    _rememberIconNode(iconNode) {
      this._iconNodeStates ??= /* @__PURE__ */ new Map();
      if (this._iconNodeStates.size >= 64) {
        for (const node of this._iconNodeStates.keys()) {
          if (node.isConnected === false) this._iconNodeStates.delete(node);
        }
      }
      if (this._iconNodeStates.has(iconNode)) return;
      this._iconNodeStates.set(iconNode, {
        backgroundImage: iconNode.style?.backgroundImage || "",
        hadSearch: iconNode.classList?.contains("icon-search") === true,
        hadCollection: iconNode.classList?.contains("icon-collection") === true,
        hadPublications: iconNode.classList?.contains("icon-publications") === true
      });
    }
    /**
     * Restores an icon node to its pre-patch visual state.
     * @private
     */
    _restoreIconNode(iconNode, state = this._iconNodeStates?.get(iconNode)) {
      if (!iconNode || !state) return;
      if (String(iconNode.style?.backgroundImage || "").includes(`/content/icons/word.png`)) {
        iconNode.style.backgroundImage = state.backgroundImage;
      }
      if (iconNode.classList) {
        if (state.hadSearch) iconNode.classList.add("icon-search");
        else iconNode.classList.remove("icon-search");
        if (state.hadCollection) iconNode.classList.add("icon-collection");
        else iconNode.classList.remove("icon-collection");
        if (state.hadPublications) iconNode.classList.add("icon-publications");
        else iconNode.classList.remove("icon-publications");
      }
    }
  };
  var views_default = Views;

  // src/modules/preferences.mjs
  var prefix = "extensions.zotero.zoterocitation.";
  var settings = [
    { id: "enable", key: "enable", defaultValue: true },
    { id: "dragCite", key: "dragCite.enable", defaultValue: true },
    { id: "collections", key: "collections.enable", defaultValue: true },
    { id: "citationTags", key: "citationTags.enable", defaultValue: true },
    { id: "citationTagText", key: "citationTags.text", defaultValue: "/Citations", maxLength: 200 },
    { id: "debug", key: "debug", defaultValue: false },
    { id: "citationTagDebounceMs", key: "citationTagDebounceMs", defaultValue: 150, min: 0, max: 2e3 },
    { id: "itemsViewRefreshDebounceMs", key: "itemsViewRefreshDebounceMs", defaultValue: 120, min: 0, max: 2e3 },
    { id: "healthWindowMs", key: "healthWindowMs", defaultValue: 3e5, min: 1e4, max: 36e5 },
    { id: "perfSlowThresholdMs", key: "perfSlowThresholdMs", defaultValue: 50, min: 5, max: 5e3 }
  ];
  function readSetting(setting) {
    const value = Zotero.Prefs.get(prefix + setting.key, true);
    if (setting.maxLength !== void 0) {
      return typeof value === "string" && value.trim() && value.trim().length <= setting.maxLength && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : setting.defaultValue;
    }
    if (setting.min === void 0) return typeof value === "boolean" ? value : setting.defaultValue;
    if (typeof value !== "number" && typeof value !== "string" || typeof value === "string" && !value.trim()) return setting.defaultValue;
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(setting.min, Math.min(setting.max, Math.trunc(number))) : setting.defaultValue;
  }
  var Preferences = class {
    constructor(apply) {
      this._apply = apply;
      this._panels = /* @__PURE__ */ new Map();
      this._observers = [];
      this._disposed = false;
      this._applyQueue = Promise.resolve();
      this._revision = 0;
      this._applyFailed = false;
      this._startedEnabled = readSetting(settings[0]);
    }
    async register() {
      this._paneID = await Zotero.PreferencePanes.register({
        pluginID: config.addonID,
        id: "zoterocitation-preferences",
        label: config.addonName,
        src: "chrome://zoterocitation/content/preferences.xhtml",
        scripts: ["chrome://zoterocitation/content/preferences.js"],
        defaultXUL: true,
        stylesheets: ["chrome://zoterocitation/content/preferences.css"]
      });
      if (this._disposed) {
        Zotero.PreferencePanes.unregister(this._paneID);
        this._paneID = void 0;
        return;
      }
      for (const setting of settings) {
        const symbol = Zotero.Prefs.registerObserver(prefix + setting.key, () => {
          if (this._disposed) return;
          for (const panel of this._panels.values()) panel.sync(setting);
          this._scheduleApply();
        }, true);
        this._observers.push(symbol);
      }
    }
    _scheduleApply() {
      const revision = ++this._revision;
      this._applyQueue = this._applyQueue.catch((error) => Zotero.logError(error)).then(async () => {
        if (this._disposed || revision !== this._revision) return;
        try {
          const result = await this._apply();
          if (this._disposed || revision !== this._revision) return;
          this._applyFailed = result?.complete === false;
        } catch (error) {
          Zotero.logError(error);
          if (this._disposed || revision !== this._revision) return;
          this._applyFailed = true;
        }
        for (const panel of this._panels.values()) panel.updateStatus();
      });
    }
    get settled() {
      return this._applyQueue;
    }
    init(win) {
      const root = win.document.getElementById("zoterocitation-settings");
      if (!root || this._disposed || this._panels.has(root)) return;
      const listeners = [];
      const invalid = /* @__PURE__ */ new Map();
      const status = root.querySelector("#zoterocitation-settings-status");
      const updateStatus = () => {
        if (invalid.size) {
          const message = invalid.values().next().value;
          win.document.l10n.setAttributes(status, message.id, message.args);
          return;
        }
        win.document.l10n.setAttributes(status, this._applyFailed ? "zoterocitation-settings-apply-failed" : readSetting(settings[0]) !== this._startedEnabled ? "zoterocitation-settings-restart" : "zoterocitation-settings-saved");
      };
      const updateDependencies = () => {
        const tagsEnabled = root.querySelector("#zoterocitation-setting-citationTags")?.checked;
        const tagTextInput = root.querySelector("#zoterocitation-setting-citationTagText");
        if (tagTextInput) tagTextInput.disabled = !tagsEnabled;
        const tagTextRow = typeof tagTextInput?.closest === "function" ? tagTextInput.closest(".zoterocitation-number-row") : null;
        if (tagTextRow?.classList) tagTextRow.classList.toggle("is-disabled", !tagsEnabled);
      };
      const on = (node, type, handler) => {
        node.addEventListener(type, handler);
        listeners.push(() => node.removeEventListener(type, handler));
      };
      const sync = (setting) => {
        const input = root.querySelector(`#zoterocitation-setting-${setting.id}`);
        invalid.delete(setting.id);
        if (typeof setting.defaultValue === "boolean") input.checked = readSetting(setting);
        else {
          input.value = String(readSetting(setting));
          input.setCustomValidity("");
        }
        updateStatus();
      };
      const dispose = () => {
        for (const remove of listeners) remove();
        this._panels.delete(root);
      };
      this._panels.set(root, { sync, dispose, updateStatus });
      const save = (values) => {
        try {
          for (const [setting, value] of values) Zotero.Prefs.set(prefix + setting.key, value, true);
          updateStatus();
        } catch (error) {
          Zotero.logError(error);
          for (const setting of settings) sync(setting);
          this._applyQueue = this._applyQueue.then(() => {
            if (!this._disposed && this._panels.has(root)) win.document.l10n.setAttributes(status, "zoterocitation-settings-save-failed");
          });
          win.document.l10n.setAttributes(status, "zoterocitation-settings-save-failed");
        }
      };
      for (const setting of settings) {
        const input = root.querySelector(`#zoterocitation-setting-${setting.id}`);
        sync(setting);
        if (typeof setting.defaultValue !== "boolean") on(input, "input", () => {
          input.setCustomValidity("");
          invalid.delete(setting.id);
          updateStatus();
        });
        on(input, "change", () => {
          let value = input.checked;
          if (setting.maxLength !== void 0) {
            value = input.value.trim();
            if (!value || value.length > setting.maxLength || /[\x00-\x1f\x7f]/.test(input.value)) {
              invalid.set(setting.id, { id: "zoterocitation-settings-invalid-tag" });
              updateStatus();
              input.reportValidity();
              return;
            }
          }
          if (setting.min !== void 0) {
            value = Number(input.value);
            if (!input.value.trim() || !Number.isInteger(value) || value < setting.min || value > setting.max) {
              input.reportValidity();
              invalid.set(setting.id, { id: "zoterocitation-settings-invalid", args: { min: setting.min, max: setting.max } });
              updateStatus();
              return;
            }
          }
          save([[setting, value]]);
          updateDependencies();
        });
      }
      on(root.querySelector("#zoterocitation-settings-reset"), "click", () => {
        save(settings.map((setting) => [setting, setting.defaultValue]));
        for (const setting of settings) sync(setting);
      });
      on(win, "unload", dispose);
    }
    dispose() {
      this._disposed = true;
      for (const panel of [...this._panels.values()]) panel.dispose();
      for (const symbol of this._observers) {
        try {
          Zotero.Prefs.unregisterObserver(symbol);
        } catch (error) {
          Zotero.logError(error);
        }
      }
      this._observers = [];
      if (this._paneID) Zotero.PreferencePanes.unregister(this._paneID);
      this._paneID = void 0;
    }
  };

  // src/hooks.mjs
  var windowBindings = /* @__PURE__ */ new Map();
  var startupPromise;
  var shutdownPromise;
  async function onStartup() {
    if (startupPromise) return startupPromise;
    if (shutdownPromise || addon.data.alive === false) return;
    startupPromise = (async () => {
      await Promise.all([Zotero.initializationPromise, Zotero.unlockPromise, Zotero.uiReadyPromise]);
      if (!addon.data.alive) return;
      const mainWindow = Zotero.getMainWindow();
      if (!mainWindow?.document) throw new Error("Zotero main window is unavailable");
      globalThis.window = mainWindow;
      globalThis.document = mainWindow.document;
      globalThis.ZoteroPane = mainWindow.ZoteroPane;
      globalThis.Zotero_Tabs = mainWindow.Zotero_Tabs;
      await initLocale();
      if (!addon.data.alive) return;
      const preferences = new Preferences(applyPreferences);
      addon.data.preferences = preferences;
      addon.api.initPreferences = (win) => preferences.init(win);
      await preferences.register();
      if (!addon.data.alive) return;
      if (Zotero.Prefs.get("extensions.zotero.zoterocitation.enable", true) === false) {
        return;
      }
      addon.data.probeWordWindowTitles = probeWordWindowTitles;
      const citation = new Citation();
      addon.data.citation = citation;
      await citation.listener(1e3);
      if (!addon.data.alive) return;
      const views = new views_default();
      addon.data.views = views;
      for (const win of Zotero.getMainWindows?.() || [mainWindow]) await attachWindow(win);
      if (!addon.data.alive) return;
      await views.createCitationColumn();
      if (!addon.data.alive) return;
    })();
    try {
      return await startupPromise;
    } catch (error) {
      if (addon.data.alive) {
        await onShutdown();
      }
      throw error;
    }
  }
  async function attachWindow(win) {
    if (!win?.ZoteroPane || !addon.data.alive || !addon.data.citation || windowBindings.has(win)) return;
    const views = new views_default(win);
    const binding = { views, closed: false };
    windowBindings.set(win, binding);
    try {
      await views.prepareWindow?.();
      if (binding.closed || !addon.data.alive) return;
      await views.patchIcon();
      if (binding.closed || !addon.data.alive) return;
      await views.dragCite();
      if (binding.closed || !addon.data.alive) return;
    } catch (error) {
      await detachWindow(win);
      throw error;
    }
  }
  async function detachWindow(win) {
    const binding = windowBindings.get(win);
    if (!binding) return;
    binding.closed = true;
    windowBindings.delete(win);
    await runShutdownStep("dispose window UI", () => binding.views.dispose());
    if (globalThis.window === win) {
      globalThis.window = globalThis.document = globalThis.ZoteroPane = globalThis.Zotero_Tabs = void 0;
    }
  }
  async function onMainWindowLoad(win) {
    await startupPromise;
    await attachWindow(win);
  }
  async function onMainWindowUnload(win) {
    await detachWindow(win);
  }
  async function applyPreferences() {
    if (!addon.data.alive) return;
    const result = await addon.data.citation?.applyPreferences();
    for (const binding of windowBindings.values()) {
      if (!binding.closed) await binding.views.dragCite();
    }
    return result;
  }
  async function runShutdownStep(name, action) {
    try {
      await action();
    } catch (error) {
      try {
        Zotero.logError(new Error(`ZoteroCitation shutdown failed during ${name}`, { cause: error }));
      } catch (logError) {
        console.error(`ZoteroCitation shutdown failed during ${name}`, error, logError);
      }
    }
  }
  async function onShutdown() {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      addon.data.alive = false;
      if (addon.data.preferences) {
        await runShutdownStep("remove preferences", () => addon.data.preferences.dispose());
        delete addon.api.initPreferences;
      }
      await runShutdownStep("dispose UI", () => addon.data.views?.dispose?.());
      for (const win of [...windowBindings.keys()]) await detachWindow(win);
      await runShutdownStep("clear citation state", () => addon.data.citation?.clear?.());
      await runShutdownStep("close drop-target native libraries", () => {
        delete addon.data.probeWordWindowTitles;
        delete addon.data.lastDroppedWordWindow;
        if (typeof closeDropTargetCtypes === "function") closeDropTargetCtypes();
      });
      await runShutdownStep("restore host methods", () => runtime.unregisterAll());
      addon.data.locale = void 0;
      globalThis.window = globalThis.document = globalThis.ZoteroPane = globalThis.Zotero_Tabs = void 0;
      if (Zotero[config.addonInstance] === addon) delete Zotero[config.addonInstance];
    })();
    return shutdownPromise;
  }
  var hooks_default = {
    onStartup,
    onShutdown,
    onMainWindowLoad,
    onMainWindowUnload
  };
  var hooks_default2 = hooks_default;

  // src/modules/cite.mjs
  var citeItemsInFlight = false;
  var citeItems = async (requestedItems = null) => {
    if (citeItemsInFlight || addon.data.alive === false) {
      return;
    }
    let selectedItems = requestedItems;
    if (!selectedItems) {
      if (Zotero_Tabs.selectedIndex === 0) {
        selectedItems = ZoteroPane.getSelectedItems();
      } else {
        const reader = Zotero.Reader.getByTabID(Zotero_Tabs.selectedID);
        const attachment = reader && Zotero.Items.get(reader.itemID);
        selectedItems = attachment?.parentItem ? [attachment.parentItem] : [];
      }
    }
    if (!Array.isArray(selectedItems) || !selectedItems.length || !selectedItems.every((item) => item?.isRegularItem?.() && item.isTopLevelItem())) return;
    const selectedIDs = [...new Set(selectedItems.map((item) => item.id))];
    if (typeof Zotero.Integration?.Session?.prototype?.cite !== "function") return;
    citeItemsInFlight = true;
    const cite = Zotero.Integration.Session.prototype.cite;
    const integration = Zotero.Integration;
    const getApplication = integration.getApplication;
    let wrappedGetApplication;
    if (typeof getApplication === "function") {
      wrappedGetApplication = function(...args) {
        const application = Reflect.apply(getApplication, this, args);
        if (args[0] === "WinWord" && typeof application?.getDocument === "function" && typeof application.getActiveDocument === "function") {
          application.getActiveDocument = function() {
            return this.getDocument("");
          };
        }
        return application;
      };
      integration.getApplication = wrappedGetApplication;
    }
    const patchedCite = async function(field, addNote = false, addAnnotations = false) {
      if (addon.data.alive === false) return cite.apply(this, arguments);
      if (typeof this._insertCitingResult !== "function" || typeof this.addCitation !== "function" || typeof Zotero.Integration.CitationEditInterface !== "function") {
        return cite.apply(this, arguments);
      }
      let newField;
      let citation;
      let committed = false;
      try {
        if (field) {
          field = await Zotero.Integration.Field.loadExisting(field);
          if (field.type != 1) {
            throw new Zotero.Exception.Alert("integration.error.notInCitation");
          }
          citation = new Zotero.Integration.Citation(field, await field.unserialize(), await field.getNoteIndex());
        } else {
          newField = true;
          field = new Zotero.Integration.CitationField(await this.addField(true));
          citation = new Zotero.Integration.Citation(field);
        }
        await citation.prepareForEditing();
        let fieldIndexPromise, citationsByItemIDPromise;
        if (!this.data.prefs.delayCitationUpdates || !Object.keys(this.citationsByItemID).length || this._sessionUpToDate) {
          fieldIndexPromise = this.getFields().then(async function(fields2) {
            for (let i = 0, n = fields2.length; i < n; i++) {
              if (await fields2[i].equals(field._field)) {
                field = new Zotero.Integration.CitationField(fields2[i]);
                return i;
              }
            }
            return -1;
          });
          citationsByItemIDPromise = this.updateFromDocument(0).then(() => {
            return this.citationsByItemID;
          });
        } else {
          fieldIndexPromise = Zotero.Promise.resolve(-1);
          citationsByItemIDPromise = Zotero.Promise.resolve(this.citationsByItemID);
        }
        const io = new Zotero.Integration.CitationEditInterface(
          citation,
          this.style.opt.sort_citations,
          fieldIndexPromise,
          citationsByItemIDPromise
        );
        selectedIDs.forEach((id) => {
          if (!io.citation.citationItems.some((item) => Number(item.id) === id)) {
            io.citation.citationItems.push({ id });
          }
        });
        if (!io.citation.citationItems.length) {
          throw new Zotero.Exception.UserCancelled("inserting citation");
        }
        const [fieldIndex] = await Promise.all([fieldIndexPromise, citationsByItemIDPromise]);
        const citations = await this._insertCitingResult(fieldIndex, field, io.citation);
        if (!this.data.prefs.delayCitationUpdates) {
          if (citations.length != 1) {
            var fields = await this.getFields(true);
          }
          await this.updateFromDocument(0);
        }
        for (const citation2 of citations) {
          if (fields) {
            const index2 = citation2.fieldIndex ?? citation2._fieldIndex;
            const replacement = new Zotero.Integration.CitationField(fields[index2]);
            if ("field" in citation2) citation2.field = replacement;
            else citation2._field = replacement;
          }
          const index = citation2.fieldIndex ?? citation2._fieldIndex;
          const citationField = citation2.field ?? citation2._field;
          await this.addCitation(index, await citationField.getNoteIndex(), citation2);
          committed = true;
        }
        committed = true;
        try {
          const sessionID = this.sessionID;
          if (addon.data.alive !== false && sessionID && Zotero.ZoteroCitation?.api?.refreshSessionCitations) {
            await Zotero.ZoteroCitation.api.refreshSessionCitations(sessionID, this);
          }
        } catch (error) {
          Zotero.logError(error);
        }
        return citations;
      } catch (error) {
        if (newField && !committed && typeof field?.delete === "function") {
          try {
            await field.delete();
            await this.getFields(true);
            await this.updateFromDocument(0);
          } catch (cleanupError) {
            Zotero.logError(cleanupError);
          }
        }
        throw error;
      }
    };
    Zotero.Integration.Session.prototype.cite = patchedCite;
    try {
      if (Zotero.isMac) {
        await Zotero.Integration.execCommand(
          "MacWord16",
          "addEditCitation",
          "/Applications/Microsoft Word.app/",
          2
        );
      } else {
        await Zotero.Integration.execCommand(
          "WinWord",
          "addEditCitation",
          null,
          // Let Word choose its current active document, not a stale stored path.
          1
        );
      }
    } finally {
      if (wrappedGetApplication && integration.getApplication === wrappedGetApplication) {
        integration.getApplication = getApplication;
      }
      if (Zotero.Integration.Session.prototype.cite === patchedCite) {
        Zotero.Integration.Session.prototype.cite = cite;
      }
      citeItemsInFlight = false;
    }
  };

  // src/runtime.mjs
  var NativeRuntime = class {
    constructor() {
      this._patches = /* @__PURE__ */ new Set();
    }
    log(...args) {
      if (globalThis.addon?.data?.citationDebugEnabled) {
        globalThis.Zotero.debug(`[ZoteroCitation] ${args.map(String).join(" ")}`);
      }
    }
    getGlobal(name) {
      return globalThis[name] ?? globalThis.Zotero?.getMainWindow?.()?.[name];
    }
    patch(owner, key, _ownerName, createWrapper) {
      if (!owner || typeof owner[key] !== "function") throw new TypeError(`Cannot wrap ${key}`);
      const original = owner[key];
      const delegate = createWrapper(original);
      if (typeof delegate !== "function") throw new TypeError(`Invalid wrapper for ${key}`);
      const entry = { owner, key, original, active: true, wrapper: null };
      entry.wrapper = function(...args) {
        return Reflect.apply(entry.active ? delegate : original, this, args);
      };
      owner[key] = entry.wrapper;
      this._patches.add(entry);
      return () => {
        entry.active = false;
        if (owner[key] === entry.wrapper) owner[key] = original;
        this._patches.delete(entry);
      };
    }
    unregisterAll() {
      for (const entry of this._patches) {
        entry.active = false;
        if (entry.owner[entry.key] === entry.wrapper) entry.owner[entry.key] = entry.original;
      }
      this._patches.clear();
    }
    get pendingPatchCount() {
      return this._patches.size;
    }
  };

  // src/addon.mjs
  var Addon = class {
    constructor() {
      this.data = { alive: true, runtime: new NativeRuntime() };
      this.hooks = hooks_default2;
      this.api = { citeItems };
    }
  };

  // src/index.mjs
  globalThis.Zotero ??= ChromeUtils.importESModule("chrome://zotero/content/zotero.mjs").Zotero;
  if (!Zotero[config.addonInstance]) {
    globalThis.addon = new Addon();
    globalThis.runtime = addon.data.runtime;
    Zotero[config.addonInstance] = addon;
    addon.hooks.onStartup().catch((error) => Zotero.logError(error));
  }
})();
