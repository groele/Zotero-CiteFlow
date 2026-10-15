import { config } from "../config.mjs";
async function initLocale() {
  if (addon.data.locale) return;
  const Localization = runtime.getGlobal("Localization")
    ?? ChromeUtils.importESModule("resource://gre/modules/Localization.sys.mjs").Localization;
  const l10n = new Localization([`${config.addonRef}-addon.ftl`]);
  const [value, pending, unknownDrop] = await Promise.all([
    l10n.formatValue(`${config.addonRef}-column-citation`),
    l10n.formatValue(`${config.addonRef}-collection-pending`),
    l10n.formatValue(`${config.addonRef}-drag-target-unknown`)
  ]);
  if (addon.data.alive) addon.data.locale = {
    "column-citation": value || "Citation",
    "collection-pending": pending || "Word document (pending name)",
    "drag-target-unknown": unknownDrop || "Could not confirm the Word drop target. Drag the item onto a Word document and try again."
  };
}
function getString(key) {
  return addon.data.locale?.[key] || `${config.addonRef}-${key}`;
}
export { initLocale, getString };
