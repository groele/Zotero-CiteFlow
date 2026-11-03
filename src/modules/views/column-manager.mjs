import { config } from "../../config.mjs";

// ============================================================================
// Tree Column Metadata & Ownership Lookup
// ============================================================================

export class ViewsColumnManager {
  /**
   * Retrieves column metadata from the active itemsView for CiteFlow keys.
   * @param {string} dataKey - Column data key
   * @returns {object|null} Column metadata or null
   */
  getColumnInfo(dataKey) {
    try {
      const columns = typeof this.pane.itemsView._getColumns === "function"
        ? this.pane.itemsView._getColumns()
        : typeof this.pane.itemsView.getColumns === "function" ? this.pane.itemsView.getColumns()
        : this.pane.itemsView._columns || [];
      const ownedKeys = new Set([
        dataKey,
        `${config.addonID}-${dataKey}`,
        `zoterocitation@polygon.org-${dataKey}`,
        ...(this._registeredColumnKeys || []),
        ...(addon.data.views?._registeredColumnKeys || [])
      ]);
      const columnInfo = columns.find((i) => typeof i?.dataKey === "string" && ownedKeys.has(i.dataKey));
      return columnInfo;
    } catch {
      return null;
    }
  }
}
