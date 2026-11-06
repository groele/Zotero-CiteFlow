export function isValidCitationIndexKey(key: string): boolean {
  if (typeof key !== "string" || !/^\d+$/.test(key)) return false;
  const value = Number(key);
  return Number.isSafeInteger(value) && value >= 0;
}

export function parseValidItemID(rawId: unknown): number | null {
  if (typeof rawId === "number") return Number.isSafeInteger(rawId) && rawId > 0 ? rawId : null;
  if (typeof rawId !== "string") return null;
  const value = rawId.trim();
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
