// Typed boundary for Zotero's integration objects; the Word adapter owns these values.
interface CiteItem { id: number; deleted?: boolean; inTrash?: boolean; isRegularItem?(): boolean; isTopLevelItem(): boolean }
interface NativeField { type?: number; _field?: NativeField; unserialize(): Promise<unknown>; getNoteIndex(): Promise<number>; equals(other: NativeField | undefined): Promise<boolean>; delete?(): Promise<void> }
interface NativeCitation { citationItems: Array<{ id: number | string }>; fieldIndex?: number; _fieldIndex?: number; field?: NativeField; _field?: NativeField; prepareForEditing(): Promise<void> }
interface NativeSession {
  _insertCitingResult(index: number, field: NativeField, citation: NativeCitation): Promise<NativeCitation[]>;
  addCitation(index: number, note: number, citation: NativeCitation): Promise<void>;
  addField(flag: boolean): Promise<NativeField>; getFields(refresh?: boolean): Promise<NativeField[]>;
  updateFromDocument(index: number): Promise<void>; citationsByItemID: Record<string, unknown>;
  data: { prefs: { delayCitationUpdates: boolean } }; _sessionUpToDate?: boolean;
  style: { opt: { sort_citations: boolean } }; sessionID?: string;
}
interface NativeApplication { getDocument(name: string): unknown; getActiveDocument(): unknown }
type NativeCite = (this: NativeSession, field: NativeField | null, addNote?: boolean, addAnnotations?: boolean) => Promise<unknown>;
interface CitationHost {
  getMainWindow?(): CiteWindow | null; getMainWindows?(): CiteWindow[];
  Reader: { getByTabID(id: string): { itemID: number } | undefined }; Items: { get(id: number): { parentItem?: CiteItem } | undefined };
  Integration: { Session: { prototype: { cite: NativeCite } }; getApplication?: (...args: unknown[]) => NativeApplication;
    Field: { loadExisting(field: unknown): Promise<NativeField> }; CitationField: new(field: NativeField) => NativeField;
    Citation: new(field: NativeField, data?: unknown, note?: number) => NativeCitation;
    CitationEditInterface: new(citation: NativeCitation, sort: boolean, fieldIndex: Promise<number>, citations: Promise<Record<string, unknown>>) => { citation: NativeCitation };
    execCommand(agent: string, command: string, path: string | null, type: number): Promise<unknown> };
  Exception: { Alert: new(message: string) => Error; UserCancelled: new(message: string) => Error };
  Promise: { resolve<T>(value: T): Promise<T> }; isMac: boolean; logError(error: unknown): void;
  ZoteroCitation?: { api?: { refreshSessionCitations?(id: string, session: NativeSession): Promise<void> } };
}
interface CiteWindow { Zotero_Tabs?: { selectedIndex: number; selectedID: string }; ZoteroPane?: { getSelectedItems(): CiteItem[] } }
interface CiteGlobals { window?: CiteWindow; Zotero_Tabs?: CiteWindow["Zotero_Tabs"]; ZoteroPane?: CiteWindow["ZoteroPane"] }
declare const addon: { data: { alive: boolean } };
// End typed boundary.
var citeItemsInFlight = false;
var citeItems = async (requestedItems: CiteItem[] | null = null): Promise<void> => {
  if (citeItemsInFlight || addon.data.alive === false) {
    return;
  }
  const isAlive = (): boolean => addon.data.alive !== false;
  const host = Zotero as unknown as CitationHost;
  const globals = globalThis as unknown as CiteGlobals;
  let selectedItems = requestedItems;
  if (!selectedItems) {
    const activeWin = host.getMainWindow?.() || globals.window || host.getMainWindows?.()?.[0];
    const tabs = activeWin?.Zotero_Tabs || globals.Zotero_Tabs;
    const pane = activeWin?.ZoteroPane || globals.ZoteroPane;
    if (!tabs || !pane) return;
    if (tabs.selectedIndex === 0) {
      selectedItems = pane.getSelectedItems();
    } else {
      const reader = host.Reader.getByTabID(tabs.selectedID);
      const attachment = reader && host.Items.get(reader.itemID);
      selectedItems = attachment?.parentItem ? [attachment.parentItem] : [];
    }
  }
  if (!Array.isArray(selectedItems) || !selectedItems.length
    || !selectedItems.every((item) => item && item.deleted !== true && item.inTrash !== true
      && item.isRegularItem?.() && item.isTopLevelItem())) return;
  const selectedIDs = [...new Set(selectedItems.map((item) => item.id))];
  if (typeof host.Integration?.Session?.prototype?.cite !== "function") return;
  citeItemsInFlight = true;
  const cite = host.Integration.Session.prototype.cite;
  // Zotero 10's WinWord adapter implements getActiveDocument() as
  // getDocument(null), but its getDocument() unconditionally calls
  // documentName.indexOf(). An empty name follows the adapter's active-
  // document path without changing the host module or native citation data.
  const integration = host.Integration;
  const getApplication = integration.getApplication;
  let wrappedGetApplication: CitationHost["Integration"]["getApplication"];
  const patchedApplications = new Map<NativeApplication, NativeApplication["getActiveDocument"]>();
  const restorePatchedApplications = (): void => {
    for (const [application, originalGetActiveDocument] of patchedApplications) {
      try { application.getActiveDocument = originalGetActiveDocument; } catch {}
    }
    patchedApplications.clear();
  };
  if (typeof getApplication === "function") {
    wrappedGetApplication = function(this: unknown, ...args: unknown[]) {
      const application = Reflect.apply(getApplication, this, args);
      if (args[0] === "WinWord" && typeof application?.getDocument === "function"
        && typeof application.getActiveDocument === "function") {
        if (!patchedApplications.has(application)) {
          patchedApplications.set(application, application.getActiveDocument);
        }
        application.getActiveDocument = function() {
          return this.getDocument("");
        };
      }
      return application;
    };
    integration.getApplication = wrappedGetApplication;
  }
  const patchedCite = async function(this: NativeSession, field: NativeField | null, addNote = false, addAnnotations = false): Promise<unknown> {
    if (addon.data.alive === false) return Reflect.apply(cite, this, arguments);
    if (typeof this._insertCitingResult !== "function" || typeof this.addCitation !== "function"
      || typeof host.Integration.CitationEditInterface !== "function") {
      return Reflect.apply(cite, this, arguments);
    }
    let newField: boolean | undefined;
    let citation: NativeCitation;
    let committed = false;
    try {
    if (field) {
      field = await host.Integration.Field.loadExisting(field);
      if (field.type != 1) {
        throw new host.Exception.Alert("integration.error.notInCitation");
      }
      citation = new host.Integration.Citation(field, await field.unserialize(), await field.getNoteIndex());
    } else {
      newField = true;
      field = new host.Integration.CitationField(await this.addField(true));
      citation = new host.Integration.Citation(field);
    }
    await citation.prepareForEditing();
    let fieldIndexPromise: Promise<number>, citationsByItemIDPromise: Promise<Record<string, unknown>>;
    if (!this.data.prefs.delayCitationUpdates || !Object.keys(this.citationsByItemID).length || this._sessionUpToDate) {
      fieldIndexPromise = this.getFields().then(async function(fields2) {
        for (let i = 0, n = fields2.length; i < n; i++) {
          if (await fields2[i].equals((field as NativeField)._field)) {
            field = new host.Integration.CitationField(fields2[i]);
            return i;
          }
        }
        return -1;
      });
      citationsByItemIDPromise = this.updateFromDocument(0).then(() => {
        return this.citationsByItemID;
      });
    } else {
      fieldIndexPromise = host.Promise.resolve(-1);
      citationsByItemIDPromise = host.Promise.resolve(this.citationsByItemID);
    }
    const io = new host.Integration.CitationEditInterface(
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
      throw new host.Exception.UserCancelled("inserting citation");
    }
    const [fieldIndex] = await Promise.all([fieldIndexPromise, citationsByItemIDPromise]);
    const citations = await this._insertCitingResult(fieldIndex, field, io.citation);
    if (!this.data.prefs.delayCitationUpdates) {
      if (citations.length != 1) {
        var fields: NativeField[] | undefined = await this.getFields(true);
      }
      await this.updateFromDocument(0);
    }
    // ========== 核心：插入前的不完整畫写 ==========
    for (const citation2 of citations) {
      if (fields) {
        const index = (citation2.fieldIndex ?? citation2._fieldIndex)!;
        const replacement = new host.Integration.CitationField(fields[index]);
        if ("field" in citation2) citation2.field = replacement;
        else citation2._field = replacement;
      }
      const index = (citation2.fieldIndex ?? citation2._fieldIndex)!;
      const citationField = (citation2.field ?? citation2._field)!;
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
      if (isAlive() && sessionID && host.ZoteroCitation?.api?.refreshSessionCitations) {
        await host.ZoteroCitation.api.refreshSessionCitations(sessionID, this);
      }
    } catch (error) {
      host.logError(error);
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
        } catch (cleanupError) { host.logError(cleanupError); }
      }
      throw error;
    }
  };
  host.Integration.Session.prototype.cite = patchedCite;
  try {
    if (host.isMac) {
      await host.Integration.execCommand(
        "MacWord16",
        "addEditCitation",
        "/Applications/Microsoft Word.app/",
        2
      );
    } else {
      await host.Integration.execCommand(
        "WinWord",
        "addEditCitation",
        null, // Let Word choose its current active document, not a stale stored path.
        1
      );
    }
  } finally {
    restorePatchedApplications();
    if (wrappedGetApplication && integration.getApplication === wrappedGetApplication) {
      integration.getApplication = getApplication;
    }
    if (host.Integration.Session.prototype.cite === patchedCite) {
      host.Integration.Session.prototype.cite = cite;
    }
    citeItemsInFlight = false;
  }
};
export { citeItems };
