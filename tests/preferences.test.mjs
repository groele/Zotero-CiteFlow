import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { Preferences, settings, readSetting } from "../src/modules/preferences.mjs";

const prefix = "extensions.zotero.zoterocitation.";
function fixture() {
  const store = new Map(settings.map(s => [prefix + s.key, s.defaultValue]));
  store.set("extensions.zotero.zotero-citation.temporaryCollectionKeys", '["USER-DATA"]');
  const observers = new Map();
  const panes = new Map();
  const errors = [];
  globalThis.Zotero = {
    Prefs: {
      get(key, global) { assert.equal(global, true); return store.get(key); },
      set(key, value, global) {
        assert.equal(global, true);
        store.set(key, value);
        for (const { observed, callback } of observers.values()) if (observed === key) callback(value);
      },
      registerObserver(observed, callback, global) {
        assert.equal(global, true);
        const token = Symbol(); observers.set(token, { observed, callback }); return token;
      },
      unregisterObserver(token) { observers.delete(token); }
    },
    PreferencePanes: {
      async register(options) { panes.set(options.id, options); return options.id; },
      unregister(id) { panes.delete(id); }
    },
    logError(error) { errors.push(error); }
  };
  class Node {
    handlers = new Map();
    value = "";
    checked = false;
    addEventListener(type, fn) { this.handlers.set(type, fn); }
    removeEventListener(type, fn) { if (this.handlers.get(type) === fn) this.handlers.delete(type); }
    dispatch(type) { this.handlers.get(type)?.(); }
    setCustomValidity(value) { this.validityMessage = value; }
    reportValidity() { this.reported = true; }
  }
  const nodes = new Map(settings.map(s => [`#zoterocitation-setting-${s.id}`, new Node()]));
  nodes.set("#zoterocitation-settings-reset", new Node());
  nodes.set("#zoterocitation-settings-status", new Node());
  const root = { querySelector: id => nodes.get(id) };
  const win = new Node();
  win.document = {
    getElementById: () => root,
    l10n: { setAttributes(node, id, args) { node.l10nID = id; node.l10nArgs = args; } }
  };
  return { store, observers, panes, errors, nodes, win };
}

test('full preference keys, typed reads, ranges, and runtime defaults agree', () => {
  const f = fixture();
  const defaults = fs.readFileSync(new URL('../prefs.js', import.meta.url), 'utf8');
  const parsed = new Map();
  vm.runInNewContext(defaults, { pref: (key, value) => parsed.set(key, value) });
  for (const s of settings) assert.equal(parsed.get(prefix + s.key), s.defaultValue);
  const number = settings.find(s => s.id === 'healthWindowMs');
  for (const value of [undefined, null, '', ' ', true, false, {}, [], 'invalid']) {
    f.store.set(prefix + number.key, value); assert.equal(readSetting(number), 300000);
  }
  f.store.set(prefix + number.key, -5); assert.equal(readSetting(number), 10000);
  f.store.set(prefix + number.key, 9e9); assert.equal(readSetting(number), 3600000);
  const markup = fs.readFileSync(new URL('../chrome/content/preferences.xhtml', import.meta.url), 'utf8');
  for (const s of settings) {
    const input = markup.match(new RegExp(`<html:input id="zoterocitation-setting-${s.id}"[^>]+>`))?.[0];
    assert.ok(input, s.id);
    if (s.min !== undefined) { assert.ok(input.includes(`min="${s.min}"`)); assert.ok(input.includes(`max="${s.max}"`)); }
  }
});

test('disabled tracking still registers a pane, observers, and a restart notice', async () => {
  const f = fixture();
  f.store.set(prefix + 'enable', false);
  let applies = 0;
  const prefs = new Preferences(() => { applies++; });
  await prefs.register(); prefs.init(f.win);
  assert.equal(f.panes.get('zoterocitation-preferences').pluginID, 'citeflow@groele');
  const enable = f.nodes.get('#zoterocitation-setting-enable');
  assert.equal(enable.checked, false);
  enable.checked = true; enable.dispatch('change'); await prefs.settled;
  assert.equal(f.store.get(prefix + 'enable'), true);
  assert.equal(f.nodes.get('#zoterocitation-settings-status').l10nID, 'zoterocitation-settings-restart');
  assert.equal(applies, 1);
  prefs.dispose(); assert.equal(f.observers.size, 0); assert.equal(f.panes.size, 0);
});

test('reject invalid numbers and save valid numbers as integers across reopen', async () => {
  const f = fixture();
  const prefs = new Preferences(() => {}); await prefs.register(); prefs.init(f.win);
  const input = f.nodes.get('#zoterocitation-setting-citationTagDebounceMs');
  for (const value of ['', ' ', 'NaN', '-1', '2001', '2.5']) {
    input.value = value; input.dispatch('change');
    assert.equal(f.store.get(prefix + 'citationTagDebounceMs'), 150, value);
    assert.equal(f.nodes.get('#zoterocitation-settings-status').l10nID, 'zoterocitation-settings-invalid');
  }
  input.value = '625'; input.dispatch('change');
  assert.equal(f.store.get(prefix + 'citationTagDebounceMs'), 625);
  f.win.dispatch('unload'); input.value = '0'; prefs.init(f.win);
  assert.equal(input.value, '625'); prefs.dispose();
});

test('external changes sync controls and restore defaults preserves document metadata', async () => {
  const f = fixture();
  const prefs = new Preferences(() => {}); await prefs.register(); prefs.init(f.win); prefs.init(f.win);
  Zotero.Prefs.set(prefix + 'debug', true, true);
  assert.equal(f.nodes.get('#zoterocitation-setting-debug').checked, true);
  Zotero.Prefs.set(prefix + 'enable', false, true);
  f.nodes.get('#zoterocitation-settings-reset').dispatch('click');
  for (const s of settings) assert.equal(f.store.get(prefix + s.key), s.defaultValue);
  assert.equal(f.store.get('extensions.zotero.zotero-citation.temporaryCollectionKeys'), '["USER-DATA"]');
  assert.equal(f.nodes.get('#zoterocitation-settings-status').l10nID, 'zoterocitation-settings-saved');
  prefs.dispose(); for (const node of f.nodes.values()) assert.equal(node.handlers.size, 0);
});

test('custom tag text rejects blanks and controls, trims text, and persists across reopen', async () => {
  const f = fixture(); const prefs = new Preferences(() => {}); await prefs.register(); prefs.init(f.win);
  const input = f.nodes.get('#zoterocitation-setting-citationTagText');
  for (const value of ['', '   ', 'a'.repeat(201), 'bad\nname', 'bad\u0000name']) {
    input.value = value; input.dispatch('change');
    assert.equal(f.store.get(prefix + 'citationTags.text'), '/Citations');
    assert.equal(f.nodes.get('#zoterocitation-settings-status').l10nID, 'zoterocitation-settings-invalid-tag');
  }
  input.value = '  已引用 ✅  '; input.dispatch('change');
  assert.equal(f.store.get(prefix + 'citationTags.text'), '已引用 ✅');
  f.win.dispatch('unload'); input.value = ''; prefs.init(f.win);
  assert.equal(input.value, '已引用 ✅'); prefs.dispose();
});

test('shutdown during pane registration removes a late pane without attaching observers', async () => {
  const f = fixture();
  let resolve;
  Zotero.PreferencePanes.register = () => new Promise(r => { resolve = r; });
  const prefs = new Preferences(() => {}); const registering = prefs.register();
  prefs.dispose(); resolve('zoterocitation-preferences'); await registering;
  assert.equal(f.observers.size, 0); assert.equal(prefs._paneID, undefined);
});

test('live changes update citation performance and debug state', () => {
  const f = fixture();
  const code = fs.readFileSync(new URL('../chrome/content/scripts/index.js', import.meta.url), 'utf8');
  const start = code.indexOf('  var Citation = class {');
  const end = code.indexOf('\n  };\n\n  // src/modules/cite.mjs', start);
  const context = vm.createContext({ Zotero, addon: { data: {} } });
  vm.runInContext(code.slice(start, end + 5) + '; globalThis.CitationClass = Citation;', context);
  const citation = Object.create(context.CitationClass.prototype);
  f.store.set(prefix + 'debug', true); f.store.set(prefix + 'citationTagDebounceMs', 625);
  citation.applyPreferences();
  assert.equal(citation._debugEnabled, true); assert.equal(context.addon.data.citationDebugEnabled, true);
  assert.equal(citation._tagSyncDebounceMs, 625); assert.equal(citation._healthWindowMs, 300000);
});

test('startup registers settings before the tracking-enabled early return', () => {
  const code = fs.readFileSync(new URL('../src/hooks.mjs', import.meta.url), 'utf8');
  assert.ok(code.indexOf('await preferences.register()') < code.indexOf('zoterocitation.enable'));
  assert.match(code, /await binding.views.dragCite\(\)/);
});

test('preference write failures restore actual values and show an error', async () => {
  const f = fixture(); const prefs = new Preferences(() => {}); await prefs.register(); prefs.init(f.win);
  Zotero.Prefs.set = () => { throw Error('preference write failed'); };
  const input = f.nodes.get('#zoterocitation-setting-citationTagText');
  input.value = '未能保存'; input.dispatch('change'); await prefs.settled;
  assert.equal(input.value, '/Citations'); assert.equal(f.errors.length, 1);
  assert.equal(f.nodes.get('#zoterocitation-settings-status').l10nID, 'zoterocitation-settings-save-failed');
  prefs.dispose();
});

test('apply failures are visible and the queue can recover', async () => {
  const f = fixture(); let failing = true;
  const prefs = new Preferences(() => { if (failing) throw Error('host apply failed'); });
  await prefs.register(); prefs.init(f.win);
  Zotero.Prefs.set(prefix + 'debug', true, true); await prefs.settled;
  assert.equal(f.nodes.get('#zoterocitation-settings-status').l10nID, 'zoterocitation-settings-apply-failed');
  failing = false; Zotero.Prefs.set(prefix + 'debug', false, true); await prefs.settled;
  assert.equal(f.nodes.get('#zoterocitation-settings-status').l10nID, 'zoterocitation-settings-saved');
  prefs.dispose();
});

test('rapid updates coalesce to the final value and a late apply does not overwrite invalid input', async () => {
  const f = fixture(); let calls = 0, release;
  const prefs = new Preferences(() => { calls++; return new Promise(resolve => { release = resolve; }); });
  await prefs.register(); prefs.init(f.win);
  for (const value of ['A', 'B', 'C']) Zotero.Prefs.set(prefix + 'citationTags.text', value, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1); assert.equal(f.nodes.get('#zoterocitation-setting-citationTagText').value, 'C');
  const input = f.nodes.get('#zoterocitation-setting-citationTagText');
  input.value = ''; input.dispatch('change'); release({ complete: true }); await prefs.settled;
  assert.equal(f.nodes.get('#zoterocitation-settings-status').l10nID, 'zoterocitation-settings-invalid-tag');
  prefs.dispose();
});

test('incomplete tag application is reported and disposing cancels pending settings work', async () => {
  const f = fixture(); let calls = 0;
  const prefs = new Preferences(() => { calls++; return { complete: false }; }); await prefs.register(); prefs.init(f.win);
  Zotero.Prefs.set(prefix + 'citationTags.text', 'Test', true); await prefs.settled;
  assert.equal(f.nodes.get('#zoterocitation-settings-status').l10nID, 'zoterocitation-settings-apply-failed');
  Zotero.Prefs.set(prefix + 'citationTags.text', 'Next', true); prefs.dispose(); await prefs.settled;
  assert.equal(calls, 1); assert.equal(f.observers.size, 0); assert.equal(f.panes.size, 0);
});

test('all pane controls have unique IDs, labels, locale messages, and packaged defaults', () => {
  const markup = fs.readFileSync(new URL('../chrome/content/preferences.xhtml', import.meta.url), 'utf8');
  const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal([...markup.matchAll(/<html:input /g)].length, settings.length);
  for (const locale of ['en-US', 'zh-CN']) {
    const ftl = fs.readFileSync(new URL(`../locale/${locale}/zoterocitation-addon.ftl`, import.meta.url), 'utf8');
    const messages = new Set([...ftl.matchAll(/^(zoterocitation-[\w-]+)\s*=/gm)].map(match => match[1]));
    for (const match of markup.matchAll(/data-l10n-id="([^"]+)"/g)) assert.ok(messages.has(match[1]), `${locale}: ${match[1]}`);
  }
  for (const setting of settings) {
    if (typeof setting.defaultValue === 'boolean') assert.match(markup, new RegExp(`id="zoterocitation-setting-${setting.id}" type="checkbox"`));
    else assert.ok(markup.includes(`for="zoterocitation-setting-${setting.id}"`));
  }
});
