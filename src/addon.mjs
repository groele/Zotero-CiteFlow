import hooks from "./hooks.mjs";
import { citeItems } from "./modules/cite.mjs";
import { NativeRuntime } from "./runtime.mjs";

export default class Addon {
  constructor() {
    this.data = { alive: true, runtime: new NativeRuntime() };
    this.hooks = hooks;
    this.api = { citeItems };
  }
}
