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
    const value = await l10n.formatValue(`${config.addonRef}-column-citation`);
    if (addon.data.alive) addon.data.locale = { "column-citation": value || "Citation" };
  }
  function getString(key) {
    return addon.data.locale?.[key] || `${config.addonRef}-${key}`;
  }

  // src/modules/citation.mjs
  var TEMP_COLLECTION_RELATION = "dc:relation";
  var TEMP_COLLECTION_MARKER = "https://github.com/MuiseDestiny/zotero-citation#temporary-collection";
  var TEMP_COLLECTION_KEYS_PREF = "zotero-citation.temporaryCollectionKeys";
  var TEMP_SEARCH_KEYS_PREF = "zotero-citation.managedSearchKeys";
  var MANAGED_TAG_IDS_PREF = "zotero-citation.managedCitationTagIDs";
  var MANAGED_TAG_STATE_PREF = "zotero-citation.managedCitationTagState";
  var Citation = class {
    constructor() {
      this.sessions = {};
      this._initializationTasks = /* @__PURE__ */ new Map();
      this._activeRefreshTasks = /* @__PURE__ */ new Set();
      this._refreshStateBySession = /* @__PURE__ */ new WeakMap();
      this._errors = [];
      Zotero.ZoteroCitation.api.sessionRevision = 0;
      Zotero.ZoteroCitation.api.getDiagnostics = this.getDiagnostics.bind(this);
      Zotero.ZoteroCitation.api.sessions = this.sessions;
      Zotero.ZoteroCitation.api.updateCitations = this.updateCitations.bind(this);
      Zotero.ZoteroCitation.api.refreshSessionCitations = this.refreshSessionCitations.bind(this);
      Zotero.ZoteroCitation.api.getSortedItemIDs = this.getSortedItemIDs.bind(this);
      Zotero.ZoteroCitation.api.syncCitationTags = this.syncCitationTags.bind(this);
      Zotero.ZoteroCitation.api.scheduleCitationTagSync = this.scheduleCitationTagSync.bind(this);
      Zotero.ZoteroCitation.api.getDebugStats = this.getDebugStats.bind(this);
      Zotero.ZoteroCitation.api.resetDebugStats = this.resetDebugStats.bind(this);
      Zotero.ZoteroCitation.api.assertHealth = this.assertHealth.bind(this);
      Zotero.ZoteroCitation.api.getHealthSummary = this.getHealthSummary.bind(this);
      Zotero.ZoteroCitation.api.runHealthCheck = this.runHealthCheck.bind(this);
      Zotero.ZoteroCitation.api.runHealthSummaryCheck = this.runHealthSummaryCheck.bind(this);
      Zotero.ZoteroCitation.api.getPerformanceStats = this.getPerformanceStats.bind(this);
      Zotero.ZoteroCitation.api.resetPerformanceStats = this.resetPerformanceStats.bind(this);
      Zotero.ZoteroCitation.api.runPerformanceCheck = this.runPerformanceCheck.bind(this);
      this._debugEnabled = this._getBoolPref("extensions.zotero.zoterocitation.debug", false);
      try {
        addon.data.citationDebugEnabled = this._debugEnabled;
      } catch (e) {
      }
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
      this._sessionUpdateQueue = {};
      this._sessionUpdateRevision = {};
      this._emptyReadCountBySession = {};
      this._refreshRetryTimerBySession = {};
      this._missingSessionCountBySession = {};
      this._docIdBySession = {};
      this.activeSessionID = null;
      this._execCommandBindings = /* @__PURE__ */ new Map();
      this._execCommandSerial = 0;
      this._collectionRenameRetryTimerBySession = {};
      this._collectionRenameRetryCountBySession = {};
      this._tagSyncDebounceMs = 150;
      this._itemsViewRefreshTimer = null;
      this._itemsViewRefreshDebounceMs = 120;
      this._healthWindowMs = 3e5;
      this._perfSlowThresholdMs = 50;
      this._tagSyncDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.citationTagDebounceMs", this._tagSyncDebounceMs, 0, 2e3);
      this._itemsViewRefreshDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.itemsViewRefreshDebounceMs", this._itemsViewRefreshDebounceMs, 0, 2e3);
      this._healthWindowMs = this._getClampedIntPref("extensions.zotero.zoterocitation.healthWindowMs", this._healthWindowMs, 1e4, 36e5);
      this._perfSlowThresholdMs = this._getClampedIntPref("extensions.zotero.zoterocitation.perfSlowThresholdMs", this._perfSlowThresholdMs, 5, 5e3);
      this._sortedCacheBySession = {};
      this._lastRefreshAt = {};
      this._minRefreshInterval = 500;
      this._listenerTimer = null;
      this._listenerStopped = false;
      this._originalExecCommand = null;
      this._execCommandWrapper = null;
      this._isExecCommandHooked = false;
      this._isExecCommandRunning = false;
      this._execCommandDepth = 0;
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
      this.debugLog = (...args) => {
        if (this._debugEnabled)
          runtime.log(...args);
      };
    }
    /**
     * Remove artifacts that V30 or the older collection-based implementation
     * explicitly marked as plugin-owned. Unknown user searches are never
     * deleted automatically.
     */
    logError(message, cause) {
      const error = new Error(message, cause ? { cause } : void 0);
      (this._errors ??= []).push({ message, time: Date.now() });
      if (this._errors.length > 20) this._errors.shift();
      try {
        Zotero.logError(error);
      } catch {
        runtime.log(message);
      }
    }
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
    _invalidateSessionIndex() {
      const api = Zotero.ZoteroCitation?.api;
      if (api?.sessions === this.sessions) api.sessionRevision = (api.sessionRevision || 0) + 1;
    }
    async ensureSession(sessionID, nativeSession = Zotero.Integration.sessions?.[sessionID]) {
      if (this._listenerStopped || !nativeSession) return;
      const existing = this.sessions[sessionID];
      if (existing?.closing) return;
      if (existing?.collection) return existing;
      this._initializationTasks ??= /* @__PURE__ */ new Map();
      if (this._initializationTasks.has(sessionID)) return this._initializationTasks.get(sessionID);
      const session = existing || { idData: {}, lastName: sessionID, docId: this._docIdBySession[sessionID], pending: true };
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
        return new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string" && value) : []);
      } catch {
        return /* @__PURE__ */ new Set();
      }
    }
    _saveKeySet(prefKey, values) {
      try {
        Zotero.Prefs.set(prefKey, JSON.stringify([...values]));
      } catch (error) {
        this.logError(`Failed to save preference ${prefKey}`, error);
      }
    }
    _loadManagedTagState() {
      let raw;
      try {
        raw = Zotero.Prefs.get(MANAGED_TAG_STATE_PREF);
        const state = raw && JSON.parse(raw);
        if (state?.version === 1 && state.tags && typeof state.tags === "object" && !Array.isArray(state.tags)) {
          const entries = Object.entries(state.tags).filter(([id, name]) => Number.isSafeInteger(Number(id)) && Number(id) > 0 && typeof name === "string" && name.trim() && name.length <= 200 && !/[\x00-\x1f\x7f]/.test(name));
          return { ids: Object.fromEntries(entries.map(([id]) => [id, true])), names: Object.fromEntries(entries) };
        }
        if (raw) throw new Error("Unsupported managed citation tag state");
      } catch (error) {
        this.logError("Failed to read managed citation tag state", error);
      }
      if (raw) return { ids: {}, names: {} };
      const keys = this._loadKeySet(MANAGED_TAG_IDS_PREF);
      return { ids: Object.fromEntries([...keys].map((key) => [key, true])), names: Object.fromEntries([...keys].map((key) => [key, "/Citations"])) };
    }
    _saveManagedTagIDs() {
      try {
        const tags = Object.fromEntries(Object.keys(this._managedCitationTagIDs).map((id) => [id, this._managedCitationTagNames?.[id] || "/Citations"]));
        Zotero.Prefs.set(MANAGED_TAG_STATE_PREF, JSON.stringify({ version: 1, tags }));
      } catch (error) {
        this.logError("Failed to save managed citation tag state", error);
        return false;
      }
      this._saveKeySet(MANAGED_TAG_IDS_PREF, new Set(Object.keys(this._managedCitationTagIDs)));
      return true;
    }
    async clearStaleArtifacts() {
      const libraryID = Zotero.Libraries.userLibraryID;
      const collections = Zotero.Collections.getByLibrary(libraryID, true, true);
      const collectionsByKey = new Map(collections.map((collection) => [collection.key, collection]));
      const removedKeys = /* @__PURE__ */ new Set();
      const remainingKeys = /* @__PURE__ */ new Set();
      for (const key of this._temporaryCollectionKeys) {
        const collection = collectionsByKey.get(key);
        if (!collection) {
          continue;
        }
        try {
          await collection.eraseTx();
          removedKeys.add(key);
        } catch (error) {
          remainingKeys.add(key);
          this.logError("Failed to remove a stale citation collection", error);
        }
      }
      for (const collection of collections) {
        if (removedKeys.has(collection.key)) {
          continue;
        }
        try {
          await collection.loadDataType("relations");
          if (collection.getRelationsByPredicate(TEMP_COLLECTION_RELATION).includes(TEMP_COLLECTION_MARKER)) {
            await collection.eraseTx();
          }
        } catch (error) {
          this.logError("Failed to remove a stale citation collection", error);
        }
      }
      this._temporaryCollectionKeys = remainingKeys;
      this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);
      if (!this._managedSearchKeys.size) return;
      const searchesByKey = new Map(Zotero.Searches.getByLibrary(libraryID).map((search) => [search.key, search]));
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
    _bumpDebugCounter(key, delta = 1) {
      if (!(key in this._debugCounters)) {
        this._debugCounters[key] = 0;
      }
      this._debugCounters[key] += delta;
    }
    _recordPerf(name, durationMs) {
      const metric = this._perfStats[name];
      if (!metric || !Number.isFinite(durationMs) || durationMs < 0) {
        return;
      }
      metric.count += 1;
      metric.totalMs += durationMs;
      metric.lastMs = durationMs;
      if (durationMs > metric.maxMs) {
        metric.maxMs = durationMs;
      }
      if (durationMs >= this._perfSlowThresholdMs) {
        metric.slowCount += 1;
      }
    }
    getDebugStats() {
      return {
        counters: { ...this._debugCounters },
        recent: { errorCount: (this._errors || []).filter((error) => error.time >= Date.now() - this._healthWindowMs).length },
        states: {
          debugEnabled: this._debugEnabled,
          listenerStopped: this._listenerStopped,
          isExecCommandHooked: this._isExecCommandHooked,
          isExecCommandRunning: this._isExecCommandRunning,
          activeSessionCount: Object.keys(this.sessions || {}).length
        },
        config: { tagSyncDebounceMs: this._tagSyncDebounceMs, itemsViewRefreshDebounceMs: this._itemsViewRefreshDebounceMs, healthWindowMs: this._healthWindowMs }
      };
    }
    resetDebugStats() {
      for (const key in this._debugCounters) this._debugCounters[key] = 0;
      this._errors = [];
      return this.getDebugStats();
    }
    assertHealth() {
      const stats = this.getDebugStats();
      const errors = [], warnings = [];
      if (!stats.states.listenerStopped && !stats.states.isExecCommandHooked) errors.push("Word integration wrapper is unavailable");
      if (stats.recent.errorCount) warnings.push(stats.recent.errorCount + " operations reported an error in the health window");
      return { status: errors.length ? "error" : warnings.length ? "warn" : "ok", errors, warnings, issues: [...errors, ...warnings], stats };
    }
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
    async runHealthSummaryCheck(options = {}) {
      const {
        reset = false,
        waitMs = 0
      } = options || {};
      if (reset) {
        this.resetDebugStats();
      }
      const safeWaitMs = Number.isFinite(Number(waitMs)) ? Math.max(0, Math.min(6e5, Math.trunc(Number(waitMs)))) : 0;
      if (safeWaitMs > 0) {
        await Zotero.Promise.delay(safeWaitMs);
      }
      return {
        ...this.getHealthSummary(),
        meta: {
          resetPerformed: !!reset,
          waitedMs: safeWaitMs
        }
      };
    }
    async runHealthCheck(options = {}) {
      const {
        reset = true,
        waitMs = 0
      } = options || {};
      if (reset) {
        this.resetDebugStats();
      }
      const safeWaitMs = Number.isFinite(Number(waitMs)) ? Math.max(0, Math.min(6e5, Math.trunc(Number(waitMs)))) : 0;
      if (safeWaitMs > 0) {
        await Zotero.Promise.delay(safeWaitMs);
      }
      const result = this.assertHealth();
      return {
        ...result,
        meta: {
          resetPerformed: !!reset,
          waitedMs: safeWaitMs,
          checkedAt: Date.now()
        }
      };
    }
    getPerformanceStats() {
      const result = {};
      for (const key in this._perfStats) {
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
    resetPerformanceStats() {
      for (const key in this._perfStats) {
        this._perfStats[key] = { count: 0, totalMs: 0, maxMs: 0, lastMs: 0, slowCount: 0 };
      }
      return this.getPerformanceStats();
    }
    async runPerformanceCheck(options = {}) {
      const {
        reset = false,
        waitMs = 0
      } = options || {};
      if (reset) {
        this.resetPerformanceStats();
      }
      const safeWaitMs = Number.isFinite(Number(waitMs)) ? Math.max(0, Math.min(6e5, Math.trunc(Number(waitMs)))) : 0;
      if (safeWaitMs > 0) {
        await Zotero.Promise.delay(safeWaitMs);
      }
      return {
        ...this.getPerformanceStats(),
        meta: {
          resetPerformed: !!reset,
          waitedMs: safeWaitMs
        }
      };
    }
    _getBoolPref(key, fallback) {
      try {
        const value = Zotero.Prefs.get(key, true);
        return typeof value === "boolean" ? value : fallback;
      } catch (e) {
        return fallback;
      }
    }
    applyPreferences() {
      const tagsEnabled = Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.enable", true) !== false;
      const tagsChanged = this._citationTagsEnabled !== void 0 && this._citationTagsEnabled !== tagsEnabled;
      const tagName = this._getCitationTagName();
      const tagRenamed = this._citationTagName !== void 0 && this._citationTagName !== tagName;
      this._citationTagsEnabled = tagsEnabled;
      this._citationTagName = tagName;
      this._debugEnabled = this._getBoolPref("extensions.zotero.zoterocitation.debug", false);
      addon.data.citationDebugEnabled = this._debugEnabled;
      this._tagSyncDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.citationTagDebounceMs", 150, 0, 2e3);
      this._itemsViewRefreshDebounceMs = this._getClampedIntPref("extensions.zotero.zoterocitation.itemsViewRefreshDebounceMs", 120, 0, 2e3);
      this._healthWindowMs = this._getClampedIntPref("extensions.zotero.zoterocitation.healthWindowMs", 3e5, 1e4, 36e5);
      this._perfSlowThresholdMs = this._getClampedIntPref("extensions.zotero.zoterocitation.perfSlowThresholdMs", 50, 5, 5e3);
      if (tagsChanged || tagRenamed || this._tagPreferencesNeedSync) {
        this._lastTagSyncSig = {};
        this._tagPreferencesNeedSync = true;
        return this.syncCitationTags("__preferences__", []).then((result) => {
          this._tagPreferencesNeedSync = result?.complete === false;
          return result;
        });
      }
    }
    _getClampedIntPref(key, fallback, min, max) {
      try {
        const raw = Zotero.Prefs.get(key, true);
        if (typeof raw !== "number" && typeof raw !== "string" || typeof raw === "string" && !raw.trim()) return fallback;
        const value = Number(raw);
        if (!Number.isFinite(value)) {
          return fallback;
        }
        return Math.max(min, Math.min(max, Math.trunc(value)));
      } catch (e) {
        return fallback;
      }
    }
    _getCitationTagName() {
      const name = Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.text", true);
      return typeof name === "string" && name.trim() && name.trim().length <= 200 && !/[\x00-\x1f\x7f]/.test(name) ? name.trim() : "/Citations";
    }
    _sanitizeFolderName(rawName) {
      const fallback = "Untitled Document";
      const raw = typeof rawName === "string" ? rawName : String(rawName || "");
      const noControlChars = raw.replace(/[\u0000-\u001F\u007F]/g, " ");
      const normalized = noControlChars.replace(/\s+/g, " ").trim();
      const maxLength = 200;
      return (normalized || fallback).slice(0, maxLength);
    }
    _getDocumentDisplayName(docId) {
      let raw = typeof docId === "string" ? docId.trim() : String(docId || "").trim();
      if (!raw || raw === "__doc__") {
        return "";
      }
      raw = raw.replace(/^(["'])(.*)\1$/, "$2").trim();
      const isURL = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
      const withoutQuery = isURL ? raw.replace(/[?#].*$/, "") : raw;
      if (!withoutQuery || /[\\\/]$/.test(withoutQuery)) {
        return "";
      }
      let decoded = withoutQuery;
      try {
        decoded = decodeURIComponent(withoutQuery);
      } catch {
      }
      const normalizedPath = decoded.replace(/\\/g, "/");
      const candidate = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
      if (!candidate || candidate === "." || candidate === ".." || /^[a-z][a-z0-9+.-]*:$/i.test(candidate)) {
        return "";
      }
      try {
        return this._sanitizeFolderName(candidate.normalize("NFC"));
      } catch {
        return this._sanitizeFolderName(candidate);
      }
    }
    _setActiveSessionID(sessionID) {
      const normalized = typeof sessionID === "string" && sessionID ? sessionID : null;
      this.activeSessionID = normalized;
      try {
        if (Zotero.ZoteroCitation?.api) {
          Zotero.ZoteroCitation.api.activeSessionID = normalized;
        }
      } catch (e) {
      }
    }
    _rememberSessionDocument(sessionID, docId) {
      if (typeof sessionID !== "string" || !sessionID || !docId) {
        return;
      }
      if (this._docIdBySession[sessionID] && this._docIdBySession[sessionID] !== docId) {
        this._clearCollectionRenameRetry(sessionID);
      }
      this._docIdBySession[sessionID] = docId;
      const session = this.sessions?.[sessionID];
      if (session) {
        session.docId = docId;
      }
    }
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
    _scheduleCollectionRenameRetry(sessionID, targetName, docId = this._docIdBySession?.[sessionID]) {
      if (this._listenerStopped || !sessionID || !targetName || this._collectionRenameRetryTimerBySession?.[sessionID]) {
        return;
      }
      const attempt = (this._collectionRenameRetryCountBySession[sessionID] || 0) + 1;
      if (attempt > 2) {
        this.debugLog("[Citation execCommand] collection rename retries exhausted", sessionID);
        return;
      }
      this._collectionRenameRetryCountBySession[sessionID] = attempt;
      this._collectionRenameRetryTimerBySession[sessionID] = globalThis.setTimeout(() => {
        delete this._collectionRenameRetryTimerBySession[sessionID];
        const session = this.sessions?.[sessionID];
        if (this._listenerStopped || !session?.collection || docId && this._docIdBySession?.[sessionID] !== docId) {
          return;
        }
        this._renameCollection(sessionID, targetName, docId).catch((error) => {
          this.logError(`Failed to retry Word citation collection rename for ${sessionID}`, error);
          this._scheduleCollectionRenameRetry(sessionID, targetName, docId);
        });
      }, 100 * attempt);
    }
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
        if (this._listenerStopped) {
          return;
        }
        try {
          if (!Zotero.ZoteroCitation) {
            void this.clear().catch((error) => this.logError("Failed to clear after plugin instance removal", error));
            return;
          }
          if (this._isExecCommandRunning) {
            return;
          }
          const sessions = Zotero.Integration.sessions || {};
          const _sessions2 = this.sessions;
          for (const sessionID in _sessions2) {
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
            this._listenerTimer = globalThis.setTimeout(() => {
              this._listenerTickTask = tick();
            }, Object.keys(this.sessions).length ? t : Math.max(t, 5e3));
          }
        }
      };
      this._listenerTimer = globalThis.setTimeout(tick, t);
      if (!this._isExecCommandHooked) {
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
            const candidates = [...citationModule._execCommandBindings.values()].filter((binding2) => binding2.agent === agent && binding2.command === command);
            const binding = candidates.length === 1 ? candidates[0] : null;
            const result = await originalGetSession.apply(this, arguments);
            if (!citationModule._listenerStopped && binding && !binding.ambiguous && citationModule._execCommandBindings.get(binding.bindingID) === binding) {
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
              const pendingBindings = [...citationModule._execCommandBindings.values()].filter((candidate) => candidate.bindingID !== bindingID);
              if (currentAfterID && currentAfterID !== boundBefore && pendingBindings.length === 0 && sessionsAfter.includes(currentAfterID)) {
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
              if (citationModule.sessions?.[sessionID]) {
                delete citationModule.sessions[sessionID].docId;
              }
              delete addon.data.docId;
            }
            citationModule._setActiveSessionID(sessionID);
            if (targetName) addon.data.docId = docId;
            const _session = await citationModule.ensureSession(sessionID);
            if (!_session?.collection || citationModule._listenerStopped) return result;
            const nativeSession = integration.sessions?.[sessionID];
            if (nativeSession) await citationModule.refreshSessionCitations(sessionID, nativeSession);
            if (targetName && _session.collection.name !== targetName) {
              const previousName = _session.collection.name;
              citationModule.debugLog("[Citation execCommand] collection rename", previousName, "->", targetName);
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
    }
    // 修复：按 session 隔离的前缀方法
    _getSortedCacheKey(sessionID) {
      return `cache_${sessionID}`;
    }
    _getSortedCache(sessionID) {
      if (!this._sortedCacheBySession || typeof this._sortedCacheBySession !== "object") {
        return void 0;
      }
      const key = this._getSortedCacheKey(sessionID);
      const cache = this._sortedCacheBySession[key];
      if (!cache || typeof cache.sig !== "string" || !Array.isArray(cache.result) || cache.result.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
        return void 0;
      }
      return cache;
    }
    _setSortedCache(sessionID, sig, result) {
      if (!this._sortedCacheBySession || typeof this._sortedCacheBySession !== "object") {
        this._sortedCacheBySession = {};
      }
      const key = this._getSortedCacheKey(sessionID);
      this._sortedCacheBySession[key] = { sig, result: [...result] };
    }
    cleanupSessionState(sessionID, removeSession = true) {
      this._clearCollectionRenameRetry(sessionID);
      if (removeSession && this.sessions) {
        delete this.sessions[sessionID];
        this._invalidateSessionIndex();
      }
      delete this._docIdBySession[sessionID];
      if (this.activeSessionID === sessionID) {
        this._setActiveSessionID(null);
      }
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
    _scheduleSessionRefresh(sessionID, targetSession, delayMs = 180) {
      if (this._listenerStopped || this._refreshRetryTimerBySession[sessionID]) {
        return;
      }
      this._refreshRetryTimerBySession[sessionID] = globalThis.setTimeout(() => {
        delete this._refreshRetryTimerBySession[sessionID];
        if (this._listenerStopped || !this.sessions?.[sessionID]) {
          return;
        }
        void this.refreshSessionCitations(sessionID, targetSession).catch((error) => this.logError("Failed to retry citation refresh", error));
      }, Math.max(50, delayMs));
    }
    async clearSession(sessionID, skipTagCleanup = false) {
      const session = this.sessions?.[sessionID];
      if (!session) {
        return;
      }
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
        if (tagTask && typeof tagTask.then === "function") {
          await Promise.allSettled([tagTask]);
        }
        try {
          await this.syncCitationTags(sessionID, []);
        } catch (error) {
          this.logError(`Failed to update citation tags while closing ${sessionID}`, error);
        }
      }
      this.cleanupSessionState(sessionID, true);
      const collection = session.collection;
      if (!collection?.id) {
        return;
      }
      try {
        await collection.eraseTx();
        this._temporaryCollectionKeys.delete(collection.key);
        this._saveKeySet(TEMP_COLLECTION_KEYS_PREF, this._temporaryCollectionKeys);
      } catch (error) {
        this.logError(`Failed to remove Word citation collection ${collection.name || collection.key}`, error);
      }
    }
    getSortedItemIDs(citationsByIndex, sessionID) {
      const perfStart = Date.now();
      citationsByIndex ??= {};
      try {
        const indexKeys = Object.keys(citationsByIndex).sort((a, b) => Number(a) - Number(b));
        const parts = [];
        const seenIDs = /* @__PURE__ */ new Set();
        const SortedItemIDs = [];
        for (const key of indexKeys) {
          const values = [];
          for (const item of Array.isArray(citationsByIndex[key]?.citationItems) ? citationsByIndex[key].citationItems : []) {
            if (!item || typeof item.id !== "number" && typeof item.id !== "string") continue;
            const id = Number(item.id);
            if (!Number.isSafeInteger(id) || id <= 0) continue;
            values.push(id);
            if (!seenIDs.has(id)) {
              seenIDs.add(id);
              SortedItemIDs.push(id);
            }
          }
          parts.push(key + ":" + values.join(",") + ";");
        }
        const sig = parts.join("") || "_empty";
        const cache = this._getSortedCache(sessionID);
        if (cache?.sig === sig) return [...cache.result];
        this._setSortedCache(sessionID, sig, SortedItemIDs);
        this.debugLog("[Citation getSortedItemIDs] Session:", sessionID);
        this.debugLog("[Citation getSortedItemIDs] Document positions (keys):", indexKeys);
        this.debugLog("[Citation getSortedItemIDs] Sorted item IDs:", SortedItemIDs.slice(0, 10), SortedItemIDs.length > 10 ? "..." : "");
        this.debugLog("[Citation getSortedItemIDs] Item count:", SortedItemIDs.length);
        return SortedItemIDs;
      } catch (e) {
        runtime.log("[Citation] ERROR in getSortedItemIDs:", e);
        const cache = this._getSortedCache(sessionID);
        return cache?.result ? [...cache.result] : [];
      } finally {
        this._recordPerf("getSortedItemIDs", Date.now() - perfStart);
      }
    }
    async refreshSessionCitations(sessionID, session) {
      const task = this._refreshSessionCitations(sessionID, session);
      (this._activeRefreshTasks ??= /* @__PURE__ */ new Set()).add(task);
      try {
        return await task;
      } finally {
        this._activeRefreshTasks.delete(task);
      }
    }
    async _refreshSessionCitations(sessionID, session) {
      const perfStart = Date.now();
      if (this._listenerStopped || !this.sessions?.[sessionID] || this.sessions[sessionID].closing) return;
      const targetSession = session || Zotero.Integration.sessions[sessionID];
      if (!targetSession) {
        this.debugLog("[Citation refreshSessionCitations] Session not found:", sessionID);
        return;
      }
      this._refreshStateBySession ??= /* @__PURE__ */ new WeakMap();
      let refreshState = this._refreshStateBySession.get(targetSession);
      if (!refreshState) {
        refreshState = {};
        this._refreshStateBySession.set(targetSession, refreshState);
      }
      if (refreshState.syncing) {
        this.debugLog("[Citation refreshSessionCitations] Update in progress, skipping concurrent request");
        refreshState.pending = true;
        return;
      }
      try {
        const now = Date.now();
        const last = this._lastRefreshAt[sessionID] || 0;
        if (now - last < this._minRefreshInterval) {
          this.debugLog(`[Citation refreshSessionCitations] Throttled for session ${sessionID}`);
          this._scheduleSessionRefresh(sessionID, targetSession, this._minRefreshInterval - (now - last) + 25);
          return;
        }
        this._lastRefreshAt[sessionID] = now;
      } catch (e) {
      }
      refreshState.syncing = true;
      try {
        let citationsByItemID = targetSession.citationsByItemID;
        let citationsByIndex = targetSession.citationsByIndex;
        if (!citationsByItemID || typeof citationsByItemID !== "object") {
          runtime.log("[Citation] ERROR: citationsByItemID is invalid:", citationsByItemID);
          await targetSession.updateFromDocument(0);
          citationsByItemID = targetSession.citationsByItemID || {};
        }
        if (!citationsByIndex || typeof citationsByIndex !== "object") {
          runtime.log("[Citation] ERROR: citationsByIndex is invalid:", citationsByIndex);
          await targetSession.updateFromDocument(0);
          citationsByIndex = targetSession.citationsByIndex || {};
        }
        if (Object.keys(citationsByIndex).length === 0 && Object.keys(citationsByItemID).length > 0) {
          runtime.log("[Citation] DATA MISMATCH: citationsByIndex empty but citationsByItemID has data, attempting recovery...");
          await Zotero.Promise.delay(50);
          await targetSession.updateFromDocument(0);
          citationsByIndex = targetSession.citationsByIndex || {};
          citationsByItemID = targetSession.citationsByItemID || {};
          if (Object.keys(citationsByIndex).length === 0) {
            runtime.log("[Citation] WARNING: transient citation index mismatch; preserving last known data");
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
            this.debugLog("[Citation] Empty document snapshot awaiting confirmation", sessionID);
            this._scheduleSessionRefresh(sessionID, targetSession, 250);
            return;
          }
          this.debugLog("[Citation] No citations in document, clearing Word collection");
          this.scheduleCitationTagSync(sessionID, [], true);
          await this.updateCitations(sessionID, {}, [], targetSession.styleClass);
          return;
        }
        this._emptyReadCountBySession[sessionID] = 0;
        const sortedItemIDs = this.getSortedItemIDs(citationsByIndex, sessionID);
        if (this._listenerStopped || !this.sessions?.[sessionID]) return;
        if (!Array.isArray(sortedItemIDs) || sortedItemIDs.length === 0) {
          runtime.log("[Citation] ERROR: getSortedItemIDs returned invalid result:", sortedItemIDs);
          return;
        }
        this.debugLog("[Citation refreshSessionCitations] Final sorted", sortedItemIDs.length, "items for session", sessionID);
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
    _buildCitationTagSig(sortedItemIDs) {
      if (!Array.isArray(sortedItemIDs) || sortedItemIDs.length === 0) {
        return "";
      }
      const uniq = Array.from(new Set(
        sortedItemIDs.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
      )).sort((a, b) => a - b);
      return uniq.join(",");
    }
    scheduleCitationTagSync(sessionID, sortedItemIDs, force = false) {
      if (this._listenerStopped) return;
      const normalizedIDs = Array.isArray(sortedItemIDs) ? sortedItemIDs.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0) : [];
      const sig = this._buildCitationTagSig(normalizedIDs);
      if (normalizedIDs.length) {
        this._sessionCitedIDs[sessionID] = normalizedIDs;
      } else {
        delete this._sessionCitedIDs[sessionID];
      }
      if (this._listenerStopped) {
        return;
      }
      if (!force && this._lastTagSyncSig[sessionID] === sig) {
        return;
      }
      this._lastTagSyncSig[sessionID] = sig;
      this._pendingTagSyncIDsBySession[sessionID] = normalizedIDs;
      if (this._tagSyncTimerBySession[sessionID]) {
        return;
      }
      this._tagSyncTimerBySession[sessionID] = globalThis.setTimeout(() => {
        delete this._tagSyncTimerBySession[sessionID];
        const pendingIDs = this._pendingTagSyncIDsBySession[sessionID];
        if (!pendingIDs) {
          return;
        }
        if (this._tagSyncInFlightBySession[sessionID]) {
          return;
        }
        delete this._pendingTagSyncIDsBySession[sessionID];
        const syncPromise = this.syncCitationTags(sessionID, pendingIDs);
        this._tagSyncInFlightBySession[sessionID] = syncPromise;
        void syncPromise.catch((e) => {
          runtime.log("[Citation scheduleCitationTagSync] Unexpected error:", e);
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
    _isWritableCitationItem(item) {
      const userLibraryID = Zotero.Libraries?.userLibraryID;
      if (!item || item.libraryID !== userLibraryID || item.editable === false) {
        return false;
      }
      try {
        if (typeof item.isEditable === "function" && !item.isEditable()) {
          return false;
        }
        const library = typeof Zotero.Libraries?.get === "function" ? Zotero.Libraries.get(item.libraryID) : null;
        if (library?.editable === false || library?.readOnly === true) {
          return false;
        }
        if (typeof library?.isEditable === "function" && !library.isEditable()) {
          return false;
        }
        if (typeof library?.editable === "function" && !library.editable()) {
          return false;
        }
      } catch (e) {
        return false;
      }
      return true;
    }
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
    async _syncCitationTags(sessionID, sortedItemIDs) {
      if (this._listenerStopped && sessionID !== "__shutdown__") return;
      const tagName = this._citationTagName;
      this._managedCitationTagNames ??= {};
      const perfStart = Date.now();
      let touchedCount = 0;
      let lastYieldedTouchCount = 0;
      let hadFailures = false;
      let skipped = false;
      let ownershipChanged = false;
      this._bumpDebugCounter("syncCitationTagsRuns");
      try {
        const activeCitedIDSet = /* @__PURE__ */ new Set();
        if (Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.enable", true) !== false) {
          for (const sid in this._sessionCitedIDs) {
            const ids = this._sessionCitedIDs[sid] || [];
            ids.forEach((id) => activeCitedIDSet.add(Number(id)));
          }
        }
        for (const itemID of activeCitedIDSet) {
          if (!Number.isInteger(itemID) || itemID <= 0) {
            continue;
          }
          try {
            let item = Zotero.Items.get(itemID);
            if (!item && typeof Zotero.Items.getAsync === "function") {
              item = await Zotero.Items.getAsync(itemID);
            }
            if (!item) {
              continue;
            }
            if (!this._isWritableCitationItem(item)) {
              if (item.libraryID === Zotero.Libraries?.userLibraryID || this._managedCitationTagIDs[itemID]) skipped = true;
              continue;
            }
            if (Zotero.Prefs.get("extensions.zotero.zoterocitation.citationTags.enable", true) === false || this._citationTagName !== tagName) break;
            const oldName = this._managedCitationTagIDs[itemID] && (this._managedCitationTagNames[itemID] || "/Citations");
            const hasTag = (name) => typeof item.hasTag === "function" ? item.hasTag(name) : (item.getTags?.() || []).some((tag) => (typeof tag === "string" ? tag : tag?.tag) === name);
            const removeOld = oldName && oldName !== tagName && hasTag(oldName);
            const addNew = !hasTag(tagName);
            if (removeOld && typeof item.removeTag !== "function" || addNew && typeof item.addTag !== "function") {
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
            if (addNew || oldName === tagName && this._managedCitationTagIDs[itemID]) {
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
        const managedIDs = Object.keys(this._managedCitationTagIDs).map((id) => Number(id));
        for (const itemID of managedIDs) {
          if (activeCitedIDSet.has(itemID)) {
            continue;
          }
          try {
            let item = Zotero.Items.get(itemID);
            if (!item && typeof Zotero.Items.getAsync === "function") {
              item = await Zotero.Items.getAsync(itemID);
            }
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
            const hasCitationTag = typeof item.hasTag === "function" ? item.hasTag(managedName) : (() => {
              const tags = typeof item.getTags === "function" ? item.getTags() : [];
              return Array.isArray(tags) && tags.some((tag) => {
                const tagName2 = typeof tag === "string" ? tag : tag?.tag;
                return tagName2 === managedName;
              });
            })();
            if (hasCitationTag && typeof item.removeTag === "function") {
              item.removeTag(managedName);
              try {
                await item.saveTx();
                touchedCount += 1;
              } catch (saveError) {
                try {
                  if (typeof item.addTag === "function") {
                    item.addTag(managedName);
                  }
                } catch (rollbackError) {
                  runtime.log("[Citation syncCitationTags] Failed to roll back tag removal", itemID, rollbackError);
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
        if (touchedCount > 0) {
          this._bumpDebugCounter("syncCitationTagsTouched", touchedCount);
        }
        if (hadFailures) {
          delete this._lastTagSyncSig[sessionID];
        }
        this._recordPerf("syncCitationTags", Date.now() - perfStart);
      }
      return { complete: !hadFailures && !skipped, touchedCount };
    }
    scheduleItemsViewRefresh() {
      if (this._itemsViewRefreshTimer || this._listenerStopped) return;
      this._itemsViewRefreshTimer = globalThis.setTimeout(async () => {
        this._itemsViewRefreshTimer = null;
        if (this._listenerStopped) return;
        const panes = Zotero.getMainWindows?.().map((win) => win.ZoteroPane) || [globalThis.ZoteroPane];
        for (const pane of panes) {
          try {
            await pane?.itemsView?.refreshAndMaintainSelection();
          } catch (error) {
            this.logError("Cannot refresh the citation column", error);
          }
        }
      }, this._itemsViewRefreshDebounceMs);
    }
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
        if (this._listenerStopped || !this.sessions?.[sessionID] || this._sessionUpdateRevision[sessionID] !== revision) {
          return;
        }
        await this._applyCitations(sessionID, citationsByItemID, sortedItemIDs, styleClass, revision);
      });
      this._sessionUpdateQueue[sessionID] = task;
      try {
        await task;
      } finally {
        if (this._sessionUpdateQueue[sessionID] === task) {
          delete this._sessionUpdateQueue[sessionID];
        }
      }
    }
    async _applyCitations(sessionID, citationsByItemID, sortedItemIDs, styleClass, revision) {
      if (!citationsByItemID || typeof citationsByItemID !== "object") {
        runtime.log("[Citation updateCitations] ERROR: Invalid citationsByItemID", citationsByItemID);
        return;
      }
      if (!Array.isArray(sortedItemIDs)) {
        runtime.log("[Citation updateCitations] ERROR: sortedItemIDs is not an array", sortedItemIDs);
        return;
      }
      const citationIDKeys = Object.keys(citationsByItemID);
      const itemIDSet = new Set(sortedItemIDs.map((id) => Number(id)));
      const missingIDs = citationIDKeys.filter((id) => !itemIDSet.has(Number(id)));
      if (missingIDs.length > 0) {
        runtime.log("[Citation updateCitations] WARNING: These IDs are in citationsByItemID but not in sortedItemIDs:", missingIDs);
      }
      const isNoteStyle = styleClass === "note";
      const idIndexMap = new Map(sortedItemIDs.map((id, idx) => [Number(id), idx]));
      const oldIdData = this.sessions[sessionID]?.idData || {};
      const getPlainCitation = (id) => {
        const index = idIndexMap.get(Number(id));
        if (index === void 0) {
          runtime.log("[Citation updateCitations] WARNING: Item ID", id, "not found in sorted list");
          const previousValue = oldIdData[id]?.plainCitation;
          if (previousValue) {
            return previousValue;
          }
          return isNoteStyle ? "—" : "—: (pending)";
        }
        const order = index + 1;
        if (isNoteStyle) {
          return String(order);
        } else {
          const citations = citationsByItemID[id];
          if (!Array.isArray(citations) || citations.length === 0) {
            runtime.log("[Citation updateCitations] WARNING: Item", id, "has invalid citations", citations);
            return order + ": (error)";
          }
          return order + ": " + citations.map(
            (i) => i?.properties?.plainCitation || "(no text)"
          ).join(", ");
        }
      };
      const targetData = {};
      for (const id of citationIDKeys) {
        try {
          targetData[id] = { plainCitation: getPlainCitation(id) };
        } catch (e) {
          runtime.log("[Citation updateCitations] ERROR generating citation for ID", id, ":", e);
          targetData[id] = { plainCitation: "(error)" };
        }
      }
      if (!this.sessions[sessionID]) {
        this.debugLog("[Citation updateCitations] Session already closed:", sessionID);
        return;
      }
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
      const targetIDs = citationIDKeys.map(Number).filter((id) => {
        const item = Zotero.Items.get(id);
        return item && item.libraryID === userLibraryID && (typeof item.isTopLevelItem !== "function" || item.isTopLevelItem());
      });
      const excludedCount = citationIDKeys.length - targetIDs.length;
      if (excludedCount > 0) {
        this.debugLog(`[Citation updateCitations] Excluded ${excludedCount} missing, child, or non-user-library items from the Word collection`);
      }
      if (this._sessionUpdateRevision[sessionID] !== revision) {
        return;
      }
      await this.syncCollectionItems(citationSession, targetIDs);
      if (this._listenerStopped || citationSession.closing || this._sessionUpdateRevision[sessionID] !== revision || this.sessions?.[sessionID] !== citationSession) {
        return;
      }
      if (hasChanges) {
        citationSession.idData = targetData;
        this._invalidateSessionIndex();
        this.debugLog("[Citation updateCitations] Updated", Object.keys(targetData).length, "items for session", sessionID);
        this.scheduleItemsViewRefresh();
      }
    }
    async initCollection(sessionID, session = this.sessions[sessionID]) {
      if (!session || this._listenerStopped) {
        return;
      }
      const collection = new Zotero.Collection();
      collection.libraryID = Zotero.Libraries.userLibraryID;
      collection.name = sessionID;
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
    async syncCollectionItems(session, targetIDs) {
      const collection = session?.collection;
      if (this._listenerStopped || session?.closing || !collection?.id) {
        return;
      }
      const normalizedTargetIDs = [...new Set(targetIDs.map(Number).filter(Number.isInteger))];
      const currentIDs = collection.getChildItems(true).map((itemOrID) => typeof itemOrID === "number" ? itemOrID : itemOrID?.id).filter(Number.isInteger);
      const targetSet = new Set(normalizedTargetIDs);
      const currentSet = new Set(currentIDs);
      const remove = currentIDs.filter((id) => !targetSet.has(id));
      const add = normalizedTargetIDs.filter((id) => !currentSet.has(id));
      if (!remove.length && !add.length) {
        return;
      }
      await Zotero.DB.executeTransaction(async () => {
        if (this._listenerStopped || session.closing) return;
        if (remove.length) {
          await collection.removeItems(remove);
        }
        if (add.length) {
          await collection.addItems(add);
        }
      });
    }
    /**
     * 退出时调用
     */
    clear() {
      if (!this._clearPromise) {
        this._clearPromise = this._performClear();
      }
      return this._clearPromise;
    }
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
      if (this._isExecCommandHooked && this._originalExecCommand && Zotero.Integration.execCommand === this._execCommandWrapper) {
        Zotero.Integration.execCommand = this._originalExecCommand;
        this._isExecCommandHooked = false;
        this._originalExecCommand = null;
        this._execCommandWrapper = null;
        this._bumpDebugCounter("execHookRestored");
      } else if (this._isExecCommandHooked) {
        this.debugLog("[Citation] execCommand hook changed by another patch; leaving it installed");
        this._isExecCommandHooked = false;
        this._originalExecCommand = null;
        this._execCommandWrapper = null;
      }
      this.debugLog("[Citation debug] clear completed", this._debugCounters);
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
      const tagTasks = [...Object.values(this._tagSyncInFlightBySession), this._tagSyncQueue].filter((task) => task && typeof task.then === "function");
      if (tagTasks.length) {
        await Promise.allSettled(tagTasks);
      }
      this._sessionCitedIDs = {};
      try {
        await this.syncCitationTags("__shutdown__", []);
      } catch (error) {
        this.logError("Failed to remove managed citation tags during shutdown", error);
      }
      const sessionIDs = Object.keys(this.sessions || {});
      const cleanupResults = await Promise.allSettled(sessionIDs.map((sessionID) => this.clearSession(sessionID, true)));
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
      } catch (e) {
      }
    }
  };

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

  // src/modules/views.mjs
  var Views = class {
    constructor(win = null) {
      this._window = win;
      this._patchDisposers = [];
      this._disposed = false;
      this._dragItems = null;
      this._dragEndHandler = null;
      this._registeredColumnKeys = /* @__PURE__ */ new Set();
      this._iconNodeStates = /* @__PURE__ */ new Map();
    }
    get pane() {
      return this._window?.ZoteroPane ?? Zotero.getActiveZoteroPane?.() ?? globalThis.ZoteroPane;
    }
    get document() {
      return this._window?.document ?? globalThis.document;
    }
    get window() {
      return this._window ?? Zotero.getMainWindow?.() ?? globalThis.window;
    }
    _getSessionIndex(api) {
      const sessions = api.sessions || {};
      const revision = api.sessionRevision;
      if (Number.isSafeInteger(revision) && this._index?.sessions === sessions && this._index.revision === revision) return this._index;
      const index = { sessions, revision, byKey: /* @__PURE__ */ new Map(), byItem: /* @__PURE__ */ new Map() };
      for (const session of Object.values(sessions)) {
        const key = session?.collection?.key;
        if (key) {
          const matches = index.byKey.get(key) || [];
          matches.push(session);
          index.byKey.set(key, matches);
        }
        for (const id of Object.keys(session?.idData || {})) {
          const matches = index.byItem.get(Number(id)) || [];
          matches.push(session);
          index.byItem.set(Number(id), matches);
        }
      }
      this._index = index;
      return index;
    }
    getCitationText(itemID) {
      try {
        const api = Zotero.ZoteroCitation?.api || {};
        const index = this._getSessionIndex(api);
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
          if (collection.libraryID != null) candidates = candidates.filter((session) => session.collection.libraryID == null || session.collection.libraryID === collection.libraryID);
          for (const session of candidates) wordSessions.add(session);
        }
        if (wordSessions.size) {
          const matches2 = [...wordSessions].filter((session) => session.idData?.[itemID]);
          return matches2.length === 1 ? matches2[0].idData[itemID].plainCitation || "" : "";
        }
        const active = api.activeSessionID && index.sessions[api.activeSessionID] ? api.activeSessionID : Zotero.Integration.currentSession?.sessionID;
        if (active) return index.sessions[active]?.idData?.[itemID]?.plainCitation || "";
        const matches = index.byItem.get(Number(itemID)) || [];
        return matches.length === 1 ? matches[0].idData[itemID].plainCitation || "" : "";
      } catch (error) {
        runtime.log("Citation column lookup failed", error);
        return "";
      }
    }
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
        this._unregisterCitationColumns();
      }
    }
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
    _dragEnabled() {
      return !this._disposed && addon.data.alive !== false && Zotero.Prefs.get("extensions.zotero.zoterocitation.dragCite.enable", true) !== false;
    }
    dispose() {
      this._disposed = true;
      this._dragItems = null;
      if (this._dragEndHandler) this.document.removeEventListener("dragend", this._dragEndHandler, true);
      this._dragEndHandler = null;
      for (const [iconNode, state] of this._iconNodeStates || []) {
        this._restoreIconNode(iconNode, state);
      }
      this._iconNodeStates?.clear();
      this._index = null;
      for (const restore of this._patchDisposers || []) restore();
      this._patchDisposers = [];
      const pending = this._unregisterCitationColumns();
      this._window = null;
      return pending;
    }
    async _unregisterCitationColumns() {
      const keys = [...this._registeredColumnKeys || []];
      this._registeredColumnKeys?.clear();
      if (!keys.length) return;
      try {
        const manager = Zotero.ItemTreeManager;
        if (typeof manager.unregisterColumns === "function") await manager.unregisterColumns(keys);
        else if (typeof manager.unregisterColumn === "function") await Promise.all(keys.map((key) => manager.unregisterColumn(key)));
      } catch (error) {
        Zotero.logError(error);
      }
    }
    async dragCite() {
      if (this._dragEndHandler || this._disposed || addon.data.alive === false || Zotero.Prefs.get("extensions.zotero.zoterocitation.dragCite.enable", true) === false) return;
      this._dragEndHandler = (event) => {
        const items = this._dragItems;
        this._dragItems = null;
        if (!items?.length || !this._dragEnabled() || !event.dataTransfer || event.dataTransfer.mozUserCancelled || event.dataTransfer.dropEffect === "none") return;
        const x = event.screenX, y = event.screenY;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const width = this.window.outerWidth || this.document.documentElement.getBoundingClientRect().width;
        const height = this.window.outerHeight || this.document.documentElement.getBoundingClientRect().height;
        if (x >= this.window.screenX && x < this.window.screenX + width && y >= this.window.screenY && y < this.window.screenY + height) return;
        void addon.api.citeItems(items).catch((error) => Zotero.logError(error));
      };
      this.document.addEventListener("dragend", this._dragEndHandler, true);
      try {
        const restore = runtime.patch(
          this.pane.itemsView,
          "onDragStart",
          config.addonRef,
          (original) => (event, row) => {
            this._dragItems = null;
            const items = this.pane.getSelectedItems();
            if (this._dragEnabled() && event.dataTransfer && items?.length && items.every((item) => item?.isRegularItem?.() && item.isTopLevelItem())) {
              this._dragItems = [...items];
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
    async patchIcon() {
      try {
        const view = this;
        const restore = runtime.patch(
          this.pane.collectionsView,
          "renderItem",
          config.addonRef,
          (original) => (index, selection, oldDiv, columns) => {
            const previousIcon = oldDiv?.querySelector?.(".cell-icon");
            if (previousIcon) {
              view._restoreIconNode(previousIcon);
              view._iconNodeStates?.delete(previousIcon);
            }
            const div = original.call(this.pane.collectionsView, index, selection, oldDiv, columns);
            if (view._disposed || addon.data.alive === false) return div;
            const row = this.pane.collectionsView.getRow(index);
            const rowRef = row?.ref;
            const candidates = this._getSessionIndex(Zotero.ZoteroCitation?.api || {}).byKey.get(rowRef?.key) || [];
            const isCitationCollection = candidates.some((session) => session.collection.libraryID == null || rowRef?.libraryID == null || session.collection.libraryID === rowRef.libraryID);
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
          }
        );
        if (typeof restore === "function") (this._patchDisposers ??= []).push(restore);
      } catch (error) {
        runtime.log("[Views] Failed to patch citation collection icon:", error);
      }
    }
    _rememberIconNode(iconNode) {
      this._iconNodeStates ??= /* @__PURE__ */ new Map();
      for (const node of this._iconNodeStates.keys()) {
        if (node.isConnected === false) this._iconNodeStates.delete(node);
      }
      if (this._iconNodeStates.has(iconNode)) {
        return;
      }
      this._iconNodeStates.set(iconNode, {
        backgroundImage: iconNode.style?.backgroundImage || "",
        hadSearch: iconNode.classList?.contains("icon-search") === true,
        hadCollection: iconNode.classList?.contains("icon-collection") === true,
        hadPublications: iconNode.classList?.contains("icon-publications") === true
      });
    }
    _restoreIconNode(iconNode, state = this._iconNodeStates?.get(iconNode)) {
      if (!iconNode || !state) {
        return;
      }
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
  };
  var views_default = Views;

  // src/modules/preferences.mjs
  var prefix = "extensions.zotero.zoterocitation.";
  var settings = [
    { id: "enable", key: "enable", defaultValue: true },
    { id: "quickCite", key: "quickCite.enable", defaultValue: true },
    { id: "dragCite", key: "dragCite.enable", defaultValue: true },
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
    const keydownHandler = (event) => {
      if (event.key !== "'" || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const targets = [event.target, event.originalTarget, ...event.composedPath?.() || []].filter(Boolean);
      if (!targets.length || targets.some((target) => target.isContentEditable || "value" in target || target.closest?.('input, textarea, select, [role="textbox"], [role="combobox"]'))) return;
      if (Zotero.Prefs.get("extensions.zotero.zoterocitation.quickCite.enable", true) === false) return;
      const items = win.ZoteroPane.getSelectedItems();
      if (!items?.length || !items.every((item) => item?.isRegularItem?.() && item.isTopLevelItem())) return;
      event.preventDefault();
      event.stopPropagation();
      void citeItems(items).catch((error) => Zotero.logError(error));
    };
    const binding = { views, keydownHandler, closed: false };
    windowBindings.set(win, binding);
    try {
      await views.prepareWindow?.();
      if (binding.closed || !addon.data.alive) return;
      await views.patchIcon();
      if (binding.closed || !addon.data.alive) return;
      await views.dragCite();
      if (binding.closed || !addon.data.alive) return;
      win.document.addEventListener("keydown", keydownHandler, true);
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
    await runShutdownStep("remove keyboard listener", () => win.document.removeEventListener("keydown", binding.keydownHandler, true));
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
