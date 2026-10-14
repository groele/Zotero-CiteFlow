import { config } from "../config.mjs";
async function initLocale() {
  if (addon.data.locale) return;
  const Localization = runtime.getGlobal("Localization")
    ?? ChromeUtils.importESModule("resource://gre/modules/Localization.sys.mjs").Localization;
  const l10n = new Localization([`${config.addonRef}-addon.ftl`]);
  const value = await l10n.formatValue(`${config.addonRef}-column-citation`);
  if (addon.data.alive) addon.data.locale = { "column-citation": value || "Citation" };
}
function getString(key) {
  return addon.data.locale?.[key] || `${config.addonRef}-${key}`;
}
export { initLocale, getString };
