interface Metric { count:number; totalMs:number; maxMs:number; lastMs:number; slowCount:number }
interface TelemetryState {
 _errors: {message:string;time:number}[]; _debugCounters: Record<string,number>; _perfStats: Record<string,Metric>;
 sessions: Record<string,unknown>; _listenerStopped:boolean; _initializationTasks:Map<unknown,unknown>;
 _activeRefreshTasks:Set<unknown>; _sessionUpdateQueue:Record<string,unknown>; _tagSyncQueue?:Promise<unknown>;
 _healthWindowMs:number; _debugEnabled:boolean; _isExecCommandHooked:boolean; _isExecCommandRunning:boolean;
 _tagSyncDebounceMs:number; _itemsViewRefreshDebounceMs:number; _perfSlowThresholdMs:number;
}
type TelemetryContext = TelemetryState & CitationTelemetry;
declare const runtime: {log(...args:unknown[]):void};
// ============================================================================
// Telemetry, Metrics & Health Diagnostics
// ============================================================================

export class CitationTelemetry {
  /**
   * Records an error message and optional cause into bounded diagnostic error history.
   * @param {string} message - Descriptive error message
   * @param {Error} [cause] - Underlying exception
   */
  logError(this: TelemetryContext, message: string, cause?: unknown) {
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
  _bumpDebugCounter(this: TelemetryContext, key: string, delta = 1) {
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
  _recordPerf(this: TelemetryContext, name: string, durationMs: number) {
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
  getDiagnostics(this: TelemetryContext) {
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
  getDebugStats(this: TelemetryContext) {
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
  resetDebugStats(this: TelemetryContext) {
    for (const key in this._debugCounters || {}) this._debugCounters[key] = 0;
    this._errors = [];
    return this.getDebugStats();
  }

  /**
   * Asserts system health status and returns error/warning issues.
   * @returns {{ status: "ok"|"warn"|"error", errors: string[], warnings: string[], issues: string[], stats: object }}
   */
  assertHealth(this: TelemetryContext) {
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
  getHealthSummary(this: TelemetryContext) {
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
  _sanitizeCheckWaitMs(this: TelemetryContext, waitMs: number) {
    return Number.isFinite(Number(waitMs))
      ? Math.max(0, Math.min(600000, Math.trunc(Number(waitMs))))
      : 0;
  }

  /**
   * Runs an asynchronous health summary check with optional reset and delay.
   * @param {{ reset?: boolean, waitMs?: number }} [options]
   * @returns {Promise<object>}
   */
  async runHealthSummaryCheck(this: TelemetryContext, options: {reset?:boolean;waitMs?:number} = {}) {
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
  async runHealthCheck(this: TelemetryContext, options: {reset?:boolean;waitMs?:number} = {}) {
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
  getPerformanceStats(this: TelemetryContext) {
    const result: Record<string, Metric & {avgMs:number}> = {};
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
  resetPerformanceStats(this: TelemetryContext) {
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
  async runPerformanceCheck(this: TelemetryContext, options: {reset?:boolean;waitMs?:number} = {}) {
    const { reset = false, waitMs = 0 } = options || {};
    if (reset) this.resetPerformanceStats();
    const safeWaitMs = this._sanitizeCheckWaitMs(waitMs);
    if (safeWaitMs > 0) await Zotero.Promise.delay(safeWaitMs);
    return { ...this.getPerformanceStats(), meta: { resetPerformed: !!reset, waitedMs: safeWaitMs } };
  }
}
