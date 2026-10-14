// Small host adapter: no process-wide debug bridge, listeners, or UI framework.
export class NativeRuntime {
  constructor() {
    this._patches = new Set();
  }
  log(...args) {
    if (globalThis.addon?.data?.citationDebugEnabled) {
      globalThis.Zotero.debug(`[ZoteroCitation] ${args.map(String).join(" ")}`);
    }
  }
  getGlobal(name) {
    return globalThis[name] ?? globalThis.Zotero?.getMainWindow?.()?.[name];
  }
  patch(owner, key, _ownerName, createWrapper) {
    if (!owner || typeof owner[key] !== "function") throw new TypeError(`Cannot wrap ${key}`);
    const original = owner[key];
    const delegate = createWrapper(original);
    if (typeof delegate !== "function") throw new TypeError(`Invalid wrapper for ${key}`);
    const entry = { owner, key, original, active: true, wrapper: null };
    entry.wrapper = function(...args) {
      return Reflect.apply(entry.active ? delegate : original, this, args);
    };
    owner[key] = entry.wrapper;
    this._patches.add(entry);
    return () => {
      entry.active = false;
      if (owner[key] === entry.wrapper) owner[key] = original;
      this._patches.delete(entry);
    };
  }
  unregisterAll() {
    for (const entry of this._patches) {
      entry.active = false;
      if (entry.owner[entry.key] === entry.wrapper) entry.owner[entry.key] = entry.original;
    }
    this._patches.clear();
  }
  get pendingPatchCount() {
    return this._patches.size;
  }
}
