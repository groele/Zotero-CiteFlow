import hooks from "./hooks.ts";
import { citeItems } from "./modules/cite.ts";
import { NativeRuntime } from "./runtime.ts";

export default class Addon {
  readonly data = { alive: true, runtime: new NativeRuntime() };
  readonly hooks = hooks;
  readonly api = { citeItems };
}
