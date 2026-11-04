import hooks from "./hooks.mjs";
import { citeItems as rawCiteItems } from "./modules/cite.mjs";
import { NativeRuntime } from "./runtime.mjs";

export default class Addon {
  constructor() {
    this.data = { alive: true, runtime: new NativeRuntime() };
    this.hooks = hooks;
    this.api = {
      citeItems: async (requestedItems = null) => {
        let items = requestedItems;
        if (!items) {
          const win = globalThis.window || Zotero.getMainWindow?.() || Zotero.getMainWindows?.()?.[0];
          const tabs = win?.Zotero_Tabs || globalThis.Zotero_Tabs;
          const pane = win?.ZoteroPane || globalThis.ZoteroPane;
          if (tabs?.selectedIndex === 0) {
            items = pane?.getSelectedItems?.() || [];
          } else if (tabs) {
            const reader = Zotero.Reader?.getByTabID?.(tabs.selectedID);
            const attachment = reader && Zotero.Items?.get?.(reader.itemID);
            items = attachment?.parentItem ? [attachment.parentItem] : [];
          } else {
            items = [];
          }
        }
        if (!Array.isArray(items) || !items.length) return;
        const validItems = items.filter(item => item && item.deleted !== true && item.inTrash !== true
          && item.isRegularItem?.() && item.isTopLevelItem?.()
          && Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0);
        if (!validItems.length) return;
        return rawCiteItems(validItems);
      }
    };
  }
}
