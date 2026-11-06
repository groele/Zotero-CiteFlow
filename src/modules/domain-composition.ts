/** Install domain methods atomically, rejecting collisions with the coordinator or other domains. */
export function composeDomains(target: object, domains: ReadonlyArray<{ prototype: object }>): void {
  const names = new Set(Reflect.ownKeys(target));
  const batches: PropertyDescriptorMap[] = [];
  for (const domain of domains) {
    const descriptors = Object.getOwnPropertyDescriptors(domain.prototype);
    Reflect.deleteProperty(descriptors, "constructor");
    for (const name of Reflect.ownKeys(descriptors)) {
      if (names.has(name)) throw new Error(`Duplicate domain member: ${String(name)}`);
      names.add(name);
    }
    batches.push(descriptors);
  }
  for (const descriptors of batches) Object.defineProperties(target, descriptors);
}
