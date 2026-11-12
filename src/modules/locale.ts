import { config } from "../config.ts";

type LocaleMessages = Record<string, string>;
interface LocaleAddon { data: { locale?: LocaleMessages; alive: boolean } }
interface LocaleRuntime { getGlobal(name: string): unknown }
interface FluentLocalization { formatValue(key: string): Promise<string | null> }
type LocalizationConstructor = new (resources: string[]) => FluentLocalization;
declare const addon: LocaleAddon;
declare const runtime: LocaleRuntime;

async function initLocale(): Promise<void> {
  if (addon.data.locale) return;
  const Localization = (runtime.getGlobal("Localization")
    ?? ChromeUtils.importESModule("resource://gre/modules/Localization.sys.mjs").Localization) as LocalizationConstructor;
  const l10n = new Localization([`${config.addonRef}-addon.ftl`]);
  const [value, pending, unknownDrop, citeBusy] = await Promise.all([
    l10n.formatValue(`${config.addonRef}-column-citation`),
    l10n.formatValue(`${config.addonRef}-collection-pending`),
    l10n.formatValue(`${config.addonRef}-drag-target-unknown`),
    l10n.formatValue(`${config.addonRef}-cite-in-flight`)
  ]);
  if (addon.data.alive) addon.data.locale = {
    "column-citation": value || "Citation",
    "collection-pending": pending || "Word document (pending name)",
    "drag-target-unknown": unknownDrop || "Could not confirm the Word drop target. Drag the item onto a Word document and try again.",
    "cite-in-flight": citeBusy || "Previous citation insertion is still in progress. Please try again in a moment."
  };
}
function getString(key: string): string {
  return addon.data.locale?.[key] || `${config.addonRef}-${key}`;
}
export { initLocale, getString };
