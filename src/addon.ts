import hooks from "./hooks.ts";
import { citeItems } from "./modules/cite.ts";
import { NativeRuntime } from "./runtime.ts";

interface AddonDataState {
  alive: boolean;
  runtime: NativeRuntime;
  locale?: Record<string, string>;
}

export default class Addon {
  readonly data: AddonDataState = { alive: true, runtime: new NativeRuntime() };
  readonly hooks = hooks;
  private _citeInFlight = false;
  private _lastCiteBusyNoticeAt = 0;

  private _notifyCiteInFlight(): void {
    const now = Date.now();
    if (now - this._lastCiteBusyNoticeAt < 2000) return;
    this._lastCiteBusyNoticeAt = now;
    try {
      const ProgressWindow = (Zotero as unknown as {
        ProgressWindow?: new (opts?: { closeOnClick?: boolean }) => {
          changeHeadline?(text: string): void;
          show?(): void;
          startCloseTimer?(ms: number): void;
        };
      })?.ProgressWindow;
      if (typeof ProgressWindow !== "function") return;
      const notice = new ProgressWindow({ closeOnClick: true });
      notice.changeHeadline?.(
        this.data.locale?.["cite-in-flight"] || "Previous citation insertion is still in progress. Please try again in a moment."
      );
      notice.show?.();
      notice.startCloseTimer?.(2500);
    } catch {}
  }

  readonly api = {
    citeItems: async (requestedItems: Parameters<typeof citeItems>[0] = null): Promise<void> => {
      if (this.data.alive === false) return;
      if (this._citeInFlight) {
        this._notifyCiteInFlight();
        return;
      }
      this._citeInFlight = true;
      try {
        return await citeItems(requestedItems);
      } finally {
        this._citeInFlight = false;
      }
    }
  };
}
