const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const runtime = fs.readFileSync(path.join(__dirname, "..", "chrome/content/scripts/index.js"), "utf8");

function sliceBetween(startText, endText) {
  const start = runtime.indexOf(startText);
  const end = runtime.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, `source block ${startText} exists`);
  return runtime.slice(start, end);
}

test("UI toolkit removes false XUL boolean attributes and preserves true values", () => {
  const element = {
    attributes: new Map(),
    style: {},
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); }
  };
  const context = vm.createContext({
    BasicTool: class {
      constructor() { this._basicOptions = { ui: { enableElementRecord: false, enableElementJSONLog: false, enableElementDOMLog: false } }; }
      log() {}
    },
    HTMLElementTagNames: ["button"],
    XULElementTagNames: [],
    SVGElementTagNames: [],
    WeakRef
  });
  const uiSource = sliceBetween("  var UITool = class extends BasicTool {", "  var DialogHelper = class extends UITool {");
  vm.runInContext(`${uiSource}; globalThis.UITool = UITool;`, context);
  const ui = new context.UITool();
  ui.createElement({ createElementNS: () => element }, "button", {
    namespace: "html",
    enableElementRecord: false,
    enableElementDOMLog: false,
    attributes: { hidden: false, collapsed: false, selected: true, disabled: false, checked: true }
  });
  assert.equal(element.attributes.has("hidden"), false);
  assert.equal(element.attributes.has("collapsed"), false);
  assert.equal(element.attributes.has("disabled"), false);
  assert.equal(element.attributes.get("selected"), "true");
  assert.equal(element.attributes.get("checked"), "true");
});

test("guide helper resolves windows through documentGlobal and defaultView", () => {
  const context = vm.createContext({
    BasicTool: class {},
    Guide: class {}
  });
  const guideSource = sliceBetween("  var GuideHelper = class extends BasicTool {", "  var Guide = class {");
  vm.runInContext(`${guideSource}; globalThis.GuideHelper = GuideHelper;`, context);
  const helper = Object.create(context.GuideHelper.prototype);
  const win = {};
  assert.equal(helper._getDocumentWindow({ documentGlobal: win, defaultView: {} }), win);
  assert.equal(helper._getDocumentWindow({ defaultView: win }), win);
  assert.equal(helper._getDocumentWindow({ ownerDocument: { defaultView: win } }), win);
  assert.equal(helper._getDocumentWindow({}), undefined);
});

test("shutdown continues releasing resources when earlier cleanup steps throw", async () => {
  const calls = [];
  const addon = { data: {
    alive: true,
    views: { dispose() { calls.push("dispose"); throw new Error("dispose failed"); } },
    citation: { async clear() { calls.push("clear"); throw new Error("clear failed"); } }
  } };
  const context = vm.createContext({
    addon,
    document: { removeEventListener() { calls.push("remove listener"); throw new Error("listener failed"); } },
    ztoolkit: {
      unregisterAll() { calls.push("unregister toolkit"); throw new Error("toolkit failed"); },
      Prompt: { unregisterAll() { calls.push("unregister prompts"); } }
    },
    config: { addonInstance: "ZoteroCitation" },
    Zotero: { ZoteroCitation: addon, logError(error) { calls.push(`logged: ${error.message}`); } },
    console
  });
  const hooksSource = sliceBetween("  // src/hooks.ts", "  // src/addon.ts");
  vm.runInContext(`${hooksSource}; keydownHandler = () => {}; globalThis.hooks = hooks_default;`, context);
  await context.hooks.onShutdown();
  assert.deepEqual(calls.filter(value => !value.startsWith("logged:")), [
    "dispose", "remove listener", "clear", "unregister toolkit", "unregister prompts"
  ]);
  assert.equal(addon.data.alive, false);
  assert.equal("ZoteroCitation" in context.Zotero, false);
  assert.ok(calls.some(value => value === "logged: ZoteroCitation shutdown failed during dispose UI"));
});
