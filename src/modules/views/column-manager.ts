import { config } from "../../config.ts";

interface ColumnInfo { dataKey?: string; [name: string]: unknown }
interface ItemView {
  _getColumns?: () => ColumnInfo[];
  getColumns?: () => ColumnInfo[];
  _columns?: ColumnInfo[];
}
export interface ColumnContext { pane: { itemsView: ItemView }; _registeredColumnKeys?: Set<string> }
declare const addon: { data: { views?: { _registeredColumnKeys?: Set<string> } } };

export class ViewsColumnManager {
  getColumnInfo(this: ColumnContext, dataKey: string): ColumnInfo | null | undefined {
    try {
      const view = this.pane.itemsView;
      const columns = typeof view._getColumns === "function" ? view._getColumns()
        : typeof view.getColumns === "function" ? view.getColumns() : view._columns || [];
      const ownedKeys = new Set([
        dataKey, `${config.addonID}-${dataKey}`, `zoterocitation@polygon.org-${dataKey}`,
        ...(this._registeredColumnKeys || []), ...(addon.data.views?._registeredColumnKeys || [])
      ]);
      return columns.find(i => typeof i?.dataKey === "string" && ownedKeys.has(i.dataKey));
    } catch {
      return null;
    }
  }
}
