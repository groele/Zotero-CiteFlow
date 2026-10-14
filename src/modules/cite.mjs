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
  if (!Array.isArray(selectedItems) || !selectedItems.length
    || !selectedItems.every((item) => item?.isRegularItem?.() && item.isTopLevelItem())) return;
  const selectedIDs = [...new Set(selectedItems.map(item => Number(item.id)))];
  if (!selectedIDs.every(id => Number.isSafeInteger(id) && id > 0)) return;
  if (typeof Zotero.Integration?.Session?.prototype?.cite !== "function") return;
  citeItemsInFlight = true;
  let requestActive = true;
  const requestToken = {};
  addon.data.quickCiteToken = requestToken;
  const cite = Zotero.Integration.Session.prototype.cite;
  // Zotero 10's WinWord adapter implements getActiveDocument() as
  // getDocument(null), but its getDocument() unconditionally calls
  // documentName.indexOf(). An empty name follows the adapter's active-
  // document path without changing the host module or native citation data.
  const integration = Zotero.Integration;
  const getApplication = integration.getApplication;
  let wrappedGetApplication;
  if (typeof getApplication === "function") {
    wrappedGetApplication = function(...args) {
      const application = Reflect.apply(getApplication, this, args);
      if (args[0] === "WinWord" && typeof application?.getDocument === "function"
        && typeof application.getActiveDocument === "function") {
        application.getActiveDocument = function() {
          return this.getDocument("");
        };
      }
      return application;
    };
    integration.getApplication = wrappedGetApplication;
  }
  const patchedCite = async function(field, addNote = false, addAnnotations = false) {
    if (!requestActive || addon.data.alive === false) return cite.apply(this, arguments);
    const bindings = addon.data.citation?._execCommandBindings;
    if (bindings && ![...bindings.values()].some(binding => binding.quickCiteToken === requestToken
      && binding.sessionID === this.sessionID && !binding.ambiguous)) return cite.apply(this, arguments);
    if (typeof this._insertCitingResult !== "function" || typeof this.addCitation !== "function"
      || typeof Zotero.Integration.CitationEditInterface !== "function") {
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
    // ========== 核心：插入前的不完整畫写 ==========
    for (const citation2 of citations) {
      if (fields) {
        const index = citation2.fieldIndex ?? citation2._fieldIndex;
        const replacement = new Zotero.Integration.CitationField(fields[index]);
        if ("field" in citation2) citation2.field = replacement;
        else citation2._field = replacement;
      }
      const index = citation2.fieldIndex ?? citation2._fieldIndex;
      const citationField = citation2.field ?? citation2._field;
      await this.addCitation(index, await citationField.getNoteIndex(), citation2);
      // Once a citation is registered, a later failure must not delete a
      // field that the session already owns (for multi-field results).
      committed = true;
    }
    committed = true;
    
    // Refresh through the same guarded path as background updates. A UI
    // refresh failure must not turn a successful native insertion into failure.
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
          // addCitation can fail after mutating its in-memory indices.
          // Re-read document fields after removing the uncommitted field.
          await this.getFields(true);
          await this.updateFromDocument(0);
        } catch (cleanupError) { Zotero.logError(cleanupError); }
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
        null, // Let Word choose its current active document, not a stale stored path.
        1
      );
    }
  } finally {
    requestActive = false;
    if (wrappedGetApplication && integration.getApplication === wrappedGetApplication) {
      integration.getApplication = getApplication;
    }
    if (addon.data.quickCiteToken === requestToken) delete addon.data.quickCiteToken;
    if (Zotero.Integration.Session.prototype.cite === patchedCite) {
      Zotero.Integration.Session.prototype.cite = cite;
    }
    citeItemsInFlight = false;
  }
};
export { citeItems };
