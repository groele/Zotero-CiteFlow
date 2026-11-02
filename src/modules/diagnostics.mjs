// Diagnostics and Performance Telemetry Service for CiteFlow

export class DiagnosticsService {
  constructor(options = {}) {
    this._healthWindowMs = options.healthWindowMs || 300000;
    this._perfSlowThresholdMs = options.perfSlowThresholdMs || 50;
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

  logError(message, cause) {
    const error = new Error(message, cause ? { cause } : undefined);
    this._errors.push({ message, time: Date.now() });
    if (this._errors.length > 20) this._errors.shift();
    try {
      Zotero.logError(error);
    } catch {
      runtime?.log?.(message);
    }
  }

  bumpDebugCounter(key, delta = 1) {
    if (!(key in this._debugCounters)) {
      this._debugCounters[key] = 0;
    }
    this._debugCounters[key] += delta;
  }

  recordPerf(name, durationMs) {
    const metric = this._perfStats[name];
    if (!metric || !Number.isFinite(durationMs) || durationMs < 0) return;
    metric.count += 1;
    metric.totalMs += durationMs;
    metric.lastMs = durationMs;
    if (durationMs > metric.maxMs) metric.maxMs = durationMs;
    if (durationMs >= this._perfSlowThresholdMs) metric.slowCount += 1;
  }

  getDebugStats(hostContext = {}) {
    return {
      counters: { ...this._debugCounters },
      recent: {
        errorCount: this._errors.filter(error => error.time >= Date.now() - this._healthWindowMs).length
      },
      states: {
        debugEnabled: !!hostContext.debugEnabled,
        listenerStopped: !!hostContext.listenerStopped,
        isExecCommandHooked: !!hostContext.isExecCommandHooked,
        isExecCommandRunning: !!hostContext.isExecCommandRunning,
        activeSessionCount: Number(hostContext.activeSessionCount || 0)
      },
      config: {
        tagSyncDebounceMs: hostContext.tagSyncDebounceMs,
        itemsViewRefreshDebounceMs: hostContext.itemsViewRefreshDebounceMs,
        healthWindowMs: this._healthWindowMs
      }
    };
  }

  resetDebugStats(hostContext = {}) {
    for (const key in this._debugCounters) this._debugCounters[key] = 0;
    this._errors = [];
    return this.getDebugStats(hostContext);
  }

  assertHealth(hostContext = {}) {
    const stats = this.getDebugStats(hostContext);
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

  getHealthSummary(hostContext = {}) {
    const health = this.assertHealth(hostContext);
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
}
