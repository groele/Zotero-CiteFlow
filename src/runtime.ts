type HostFunction = (this: unknown, ...args: unknown[]) => unknown;
type PatchOwner = Record<string, unknown>;
interface PatchEntry {
  owner: PatchOwner;
  key: string;
  original: HostFunction;
  active: boolean;
  wrapper: HostFunction;
}
interface RuntimeGlobals {
  addon?: { data?: { citationDebugEnabled?: boolean } };
  Zotero?: { debug(message: string): void; getMainWindow?(): Record<string, unknown> | undefined };
  [key: string]: unknown;
}

// Host adapter: each patch has one idempotent disposer and keeps wrapper chains safe.
export class NativeRuntime {
  private readonly patches = new Set<PatchEntry>();
  private readonly patchByWrapper = new WeakMap<HostFunction, PatchEntry>();

  private restoreOriginal(entry: PatchEntry): HostFunction {
    let original = entry.original;
    let previous = this.patchByWrapper.get(original);
    while (previous && !previous.active) {
      original = previous.original;
      previous = this.patchByWrapper.get(original);
    }
    return original;
  }

  log(...args: unknown[]): void {
    const globals = globalThis as unknown as RuntimeGlobals;
    if (globals.addon?.data?.citationDebugEnabled) {
      globals.Zotero?.debug(`[ZoteroCitation] ${args.map(String).join(" ")}`);
    }
  }
  getGlobal(name: string): unknown {
    const globals = globalThis as unknown as RuntimeGlobals;
    return globals[name] ?? globals.Zotero?.getMainWindow?.()?.[name];
  }
  patch(owner: PatchOwner, key: string, _ownerName: string, createWrapper: (original: HostFunction) => HostFunction): () => void {
    if (!owner || typeof owner[key] !== "function") throw new TypeError(`Cannot wrap ${key}`);
    const original = owner[key] as HostFunction;
    const delegate = createWrapper(original);
    if (typeof delegate !== "function") throw new TypeError(`Invalid wrapper for ${key}`);
    const entry: PatchEntry = { owner, key, original, active: true, wrapper: original };
    entry.wrapper = function(this: unknown, ...args: unknown[]) {
      return Reflect.apply(entry.active ? delegate : original, this, args);
    };
    owner[key] = entry.wrapper;
    this.patches.add(entry);
    this.patchByWrapper.set(entry.wrapper, entry);
    return () => {
      entry.active = false;
      if (owner[key] === entry.wrapper) owner[key] = this.restoreOriginal(entry);
      this.patches.delete(entry);
    };
  }
  unregisterAll(): void {
    for (const entry of [...this.patches].reverse()) {
      entry.active = false;
      if (entry.owner[entry.key] === entry.wrapper) entry.owner[entry.key] = this.restoreOriginal(entry);
    }
    this.patches.clear();
  }
  get pendingPatchCount(): number {
    return this.patches.size;
  }
}
