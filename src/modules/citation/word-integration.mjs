// ============================================================================
// Word Process Hooks & Integration Engine
// ============================================================================

export class CitationWordIntegration {
  /** Background polling loop that periodically synchronizes active Word sessions. */
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
          void this.clear().catch(error => this.logError("Failed to clear after plugin instance removal", error));
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
            () => { this._listenerTickTask = tick(); },
            Object.keys(this.sessions).length ? t : Math.max(t, 5000)
          );
        }
      }
    };

    this._listenerTimer = globalThis.setTimeout(tick, t);
    this._installWordIntegrationHooks();
  }

  /** Cleans up tracked sessions absent from Zotero.Integration.sessions for 3 ticks. @private */
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
  async _syncSessionDocumentName(sessionID, nativeSession, trackedSession) {
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
    const targetName = effectiveDocId ? this._getDocumentDisplayName(effectiveDocId) : "";
    if (trackedSession.collection && targetName && trackedSession.collection.name !== targetName) {
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
      const candidates = [...citationModule._execCommandBindings.values()]
        .filter(binding => citationModule._isMatchingWordBinding(binding, agent, command));
      const binding = candidates.length === 1 ? candidates[0] : null;
      const result = await originalGetSession.apply(this, arguments);
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
    const hasExplicitDocId = typeof docId === "string" && docId.trim() !== "";
    const effectiveDocId = hasExplicitDocId
      ? docId
      : (this._resolveFallbackDocumentId?.(sessionID, nativeSession, binding.doc, true) || "");
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

    const trackedSession = await this.ensureSession(sessionID, nativeSession);
    const colEnabled = Zotero.Prefs?.get?.("extensions.zotero.zoterocitation.collections.enable", true) !== false;
    if (!trackedSession || trackedSession.pending || (colEnabled && !trackedSession.collection) || this._listenerStopped) return;
    if (nativeSession) {
      if (this._lastRefreshAt) delete this._lastRefreshAt[sessionID];
      await this.refreshSessionCitations(sessionID, nativeSession);
    }

    if (trackedSession.collection && targetName && trackedSession.collection.name !== targetName) {
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
    const colEnabled = Zotero.Prefs?.get?.("extensions.zotero.zoterocitation.collections.enable", true) !== false;
    if (existing && !existing.pending && (existing.collection || !colEnabled)) return existing;
    this._initializationTasks ??= new Map();
    if (this._initializationTasks.has(sessionID)) return this._initializationTasks.get(sessionID);

    const initialDocId = this._docIdBySession[sessionID] || this._extractSessionDocumentId?.(nativeSession) || undefined;
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
}
