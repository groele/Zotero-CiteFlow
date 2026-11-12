import type {NativeSession,TrackedSession,HostMethod,Binding,Integration,WordContext} from "./word-contract.ts";
import {applySessionCollectionRename,finalizeExecCommandCycle,finishListenerTick,prepareTickProbeWindow,recordListenerActivity,resolveAndApplyCommandDocument,syncForegroundActiveSession} from "./session-sync-helpers.ts";
const timers = globalThis as unknown as {setTimeout(callback:()=>void|Promise<void>,ms:number):number;clearTimeout(id:number):void};
declare const addon: {data:{docId?:string}};
// ============================================================================
// Word Process Hooks & Integration Engine
// ============================================================================

export class CitationWordIntegration {
  _noteListenerActivity(this: WordContext) {
    recordListenerActivity(this);
  }

  /** Background polling loop that periodically synchronizes active Word sessions. */
  async listener(this: WordContext, t: number) {
    try {
      await this.clearStaleArtifacts();
    } catch (error) {
      this.logError("Failed to clear stale citation artifacts", error);
    }
    if (this._listenerStopped) return;
    this._bumpDebugCounter("listenerStarted");
    this.debugLog("[Citation debug] listener started", this._debugCounters);

    if (this._listenerTimer) {
      timers.clearTimeout(this._listenerTimer);
      this._listenerTimer = null;
    }
    this._listenerBaseInterval = t;
    this._idleTickCount = 0;
    this._isListenerBackedOff = false;
    this._activityEpoch ??= 0;

    const scheduleNext = (delay: number) => {
      if (this._listenerStopped) return;
      this._listenerTimer = timers.setTimeout(() => { this._listenerTickTask = tick(); }, delay);
    };
    this._scheduleListenerTick = scheduleNext;

    const tick = async () => {
      if (this._listenerStopped || this._isTickRunning) return;
      this._isTickRunning = true;
      const epochBefore = prepareTickProbeWindow(this);
      try {
        if (!(Zotero as unknown as {ZoteroCitation?:unknown}).ZoteroCitation) {
          void this.clear().catch(error => this.logError("Failed to clear after plugin instance removal", error));
          return;
        }
        if (this._isExecCommandRunning) return;

        const sessions = (Zotero.Integration as unknown as Integration).sessions || {};
        await this._pruneMissingWordSessions(sessions);
        await this._syncActiveWordSessions(sessions);
        if (!this._listenerStopped && !this._isExecCommandRunning) {
          syncForegroundActiveSession(this);
        }
      } catch (e) {
        this.logError("Background citation synchronization failed", e);
      } finally {
        this._isTickRunning = false;
        finishListenerTick(this, t, epochBefore);
      }
    };

    scheduleNext(t);
    this._installWordIntegrationHooks();
  }

  /** Cleans up tracked sessions absent from (Zotero.Integration as unknown as Integration).sessions for 3 ticks. @private */
  async _pruneMissingWordSessions(this: WordContext, sessions: Record<string,NativeSession>) {
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
  async _syncActiveWordSessions(this: WordContext, sessions: Record<string,NativeSession>) {
    for (const sessionID in sessions) {
      const session = sessions[sessionID];
      if (!/(WinWord|MacWord|Word)/i.test(String(session?.agent || ""))) continue;
      let tracked;
      try {
        tracked = await this.ensureSession(sessionID, session);
        const colEnabled = Zotero.Prefs?.get?.("extensions.zotero.zoterocitation.collections.enable", true) !== false;
        if (!tracked || tracked.pending || (colEnabled && !tracked.collection) || this._listenerStopped) continue;
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
  async _syncSessionDocumentName(this: WordContext, sessionID:string, nativeSession:NativeSession, trackedSession:TrackedSession) {
    if (this._listenerStopped || !trackedSession || trackedSession.closing) return;
    const currentDocId = this._docIdBySession?.[sessionID] || trackedSession.docId || "";
    const isWindowTitleDerived = typeof currentDocId === "string" && currentDocId.startsWith("window-title:");
    const isPending = !trackedSession.collection || this._isPendingCollectionName?.(trackedSession.collection.name, sessionID);

    if (!currentDocId || isPending || isWindowTitleDerived) {
      const resolvedDocId = this._resolveFallbackDocumentId?.(sessionID, nativeSession, null, false);
      if (resolvedDocId && this._getDocumentDisplayName(resolvedDocId)) {
        this._rememberSessionDocument(sessionID, resolvedDocId);
      }
    }

    const effectiveDocId = this._docIdBySession?.[sessionID] || trackedSession.docId;
    await applySessionCollectionRename(this, sessionID, trackedSession, effectiveDocId);
  }

  /**
   * Installs interception wrappers on (Zotero.Integration as unknown as Integration).execCommand and getSession.
   * @private
   */
  _installWordIntegrationHooks(this: WordContext) {
    if (this._isExecCommandHooked) return;
    this._originalExecCommand = (Zotero.Integration as unknown as Integration).execCommand;
    if (typeof this._originalExecCommand !== "function") {
      this.logError("Word integration command API is unavailable");
      return;
    }
    this._isExecCommandHooked = true;
    this._bumpDebugCounter("execHookInstalled");

    const originalExecCommand = this._originalExecCommand;
    const originalGetSession = (Zotero.Integration as unknown as Integration).getSession;

    if (typeof originalGetSession === "function") {
      const getSessionWrapper = this._createGetSessionWrapper(originalGetSession);
      this._originalGetSession = originalGetSession;
      this._getSessionWrapper = getSessionWrapper;
      (Zotero.Integration as unknown as Integration).getSession = getSessionWrapper;
    }

    const execCommandWrapper = this._createExecCommandWrapper(originalExecCommand, originalGetSession);
    this._execCommandWrapper = execCommandWrapper;
    (Zotero.Integration as unknown as Integration).execCommand = execCommandWrapper;
  }

  _isMatchingWordBinding(this: WordContext, binding:Binding, agent:unknown, command:unknown) {
    if (!binding || binding.command !== command) return false;
    if (binding.agent === agent) return true;
    return /^MacWord/i.test(String(binding.agent || "")) && /^MacWord/i.test(String(agent || ""));
  }

  /**
   * Creates an interception wrapper for (Zotero.Integration as unknown as Integration).getSession to bind command sessions.
   * @param {Function} originalGetSession - Host getSession function
   * @returns {Function} Wrapped getSession function
   * @private
   */
  _createGetSessionWrapper(this: WordContext, originalGetSession:HostMethod) {
    const citationModule = this;
    return async function(this:unknown, app:unknown, doc:unknown, agent:unknown, command:unknown) {
      const candidates = [...citationModule._execCommandBindings.values()]
        .filter(binding => citationModule._isMatchingWordBinding(binding, agent, command));
      const binding = candidates.length === 1 ? candidates[0] : null;
      const result = await originalGetSession.apply(this, arguments as unknown as unknown[]);
      if (!citationModule._listenerStopped && binding && !binding.ambiguous
        && citationModule._execCommandBindings.get(binding.bindingID) === binding) {
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
   * Creates an interception wrapper for (Zotero.Integration as unknown as Integration).execCommand to track Word commands.
   * @param {Function} originalExecCommand - Host execCommand function
   * @param {Function} [originalGetSession] - Host getSession function
   * @returns {Function} Wrapped execCommand function
   * @private
   */
  _createExecCommandWrapper(this: WordContext, originalExecCommand:HostMethod, originalGetSession?:HostMethod) {
    const citationModule = this;
    return async function(this:unknown, agent:unknown, command:unknown, docId:unknown) {
      if (citationModule._listenerStopped || !/(WinWord|MacWord|Word)/i.test(String(agent || ""))) {
        return originalExecCommand.apply(this, arguments as unknown as unknown[]);
      }
      citationModule._bumpDebugCounter("execCommandCalls");
      citationModule.debugLog("[Citation execCommand]", agent, command, docId);

      const integration = (Zotero.Integration as unknown as Integration);
      const sessionsBefore = new Set(Object.keys(integration?.sessions || {}));
      const currentBefore = integration?.currentSession;
      const boundBefore = typeof currentBefore?.sessionID === "string" ? currentBefore.sessionID : null;
      const bindingID = ++citationModule._execCommandSerial;
      const binding: Binding = { bindingID, sessionID: null, docId, sessionsBefore, agent, command, ambiguous: false };

      for (const pending of citationModule._execCommandBindings.values()) {
        pending.ambiguous = binding.ambiguous = true;
      }
      citationModule._execCommandBindings.set(bindingID, binding);
      citationModule._execCommandDepth += 1;
      citationModule._isExecCommandRunning = true;

      let result;
      let succeeded = false;
      try {
        result = await originalExecCommand.apply(this, arguments as unknown as unknown[]);
        succeeded = true;
      } finally {
        citationModule._execCommandDepth = Math.max(0, citationModule._execCommandDepth - 1);
        citationModule._isExecCommandRunning = citationModule._execCommandDepth > 0;
        if (!succeeded) {
          citationModule._execCommandBindings.delete(bindingID);
          finalizeExecCommandCycle(citationModule, false);
        }
      }

      try {
        await citationModule._handlePostExecCommand(binding, boundBefore, originalGetSession, docId);
      } catch (error) {
        citationModule.logError("Post-command citation refresh failed", error);
      } finally {
        citationModule._execCommandBindings.delete(bindingID);
        finalizeExecCommandCycle(citationModule, binding.ambiguous);
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
  async _handlePostExecCommand(this: WordContext, binding:Binding, boundBefore:string|null, originalGetSession:HostMethod|undefined, docId:unknown) {
    if (this._listenerStopped || binding.ambiguous) return;
    const integration = (Zotero.Integration as unknown as Integration);
    if (!binding.sessionID && typeof originalGetSession !== "function") {
      const currentAfter = integration?.currentSession;
      const currentAfterID = typeof currentAfter?.sessionID === "string" ? currentAfter.sessionID : null;
      const sessionsAfter = Object.keys(integration?.sessions || {});
      const pendingBindings = [...this._execCommandBindings.values()]
        .filter(candidate => candidate.bindingID !== binding.bindingID);
      if (currentAfterID && currentAfterID !== boundBefore && pendingBindings.length === 0
        && sessionsAfter.includes(currentAfterID)) {
        binding.sessionID = currentAfterID;
      }
    }

    const sessionID = binding.sessionID;
    if (!sessionID) {
      this.debugLog("[Citation execCommand] session binding unavailable; skipping collection rename");
      return;
    }

    const nativeSession = integration.sessions?.[sessionID];
    const effectiveDocId = resolveAndApplyCommandDocument(this, sessionID, nativeSession, binding.doc, docId, addon?.data);

    const trackedSession = await this.ensureSession(sessionID, nativeSession);
    const colEnabled = Zotero.Prefs?.get?.("extensions.zotero.zoterocitation.collections.enable", true) !== false;
    if (!trackedSession || trackedSession.pending || (colEnabled && !trackedSession.collection) || this._listenerStopped) return;
    if (nativeSession) {
      if (this._lastRefreshAt) delete this._lastRefreshAt[sessionID];
      await this.refreshSessionCitations(sessionID, nativeSession);
    }

    await applySessionCollectionRename(this, sessionID, trackedSession, effectiveDocId);
  }

  /**
   * Ensures tracking state and temporary collection exist for a given Word session.
   * @param {string} sessionID - Word session identifier
   * @param {object} [nativeSession] - Zotero Integration native session
   * @returns {Promise<object|undefined>}
   */
  async ensureSession(this: WordContext, sessionID:string, nativeSession:NativeSession = (Zotero.Integration as unknown as Integration).sessions?.[sessionID]) {
    if (this._listenerStopped || !nativeSession) return;
    const existing = this.sessions[sessionID];
    if (existing?.closing) return;
    const colEnabled = Zotero.Prefs?.get?.("extensions.zotero.zoterocitation.collections.enable", true) !== false;
    if (existing && !existing.pending && (existing.collection || !colEnabled)) return existing;
    this._initializationTasks ??= new Map();
    if (this._initializationTasks.has(sessionID)) return this._initializationTasks.get(sessionID);

    const initialDocId = this._docIdBySession[sessionID] || this._extractSessionDocumentId?.(nativeSession) || undefined;
    if (initialDocId && !this._docIdBySession[sessionID]) {
      this._rememberSessionDocument(sessionID, initialDocId);
    }
    const initialName = initialDocId
      ? (this._getUniqueCollectionDisplayName?.(sessionID, initialDocId) || this._getDocumentDisplayName(initialDocId))
      : "";
    const session = existing || {
      idData: {},
      lastName: initialName || this._getPendingCollectionName(sessionID),
      docId: initialDocId,
      pending: true
    };
    session.pending = true;
    this.sessions[sessionID] = session;
    if (!existing) {
      this._lastBgWindowProbeAt = 0;
      this._noteListenerActivity?.();
    }
    this._invalidateSessionIndex();

    const task = (async () => {
      try {
        await this.initCollection(sessionID, session);
        return !this._listenerStopped && this.sessions[sessionID] === session ? session : undefined;
      } catch (error) {
        if (!existing && this.sessions[sessionID] === session) delete this.sessions[sessionID];
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
}
