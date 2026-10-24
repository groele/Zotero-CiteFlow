const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('late column registration waits for its shutdown cleanup before completing', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/views.mjs'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export default Views;', 'globalThis.Views = Views;');
  let register, unregister;
  let removed = false, finished = false;
  const context = vm.createContext({ config: { addonID: 'test' }, getString: () => 'Citation',
    addon: { data: { alive: true } }, Zotero: { logError() {}, ItemTreeManager: {
      registerColumns: () => new Promise(resolve => { register = resolve; }),
      unregisterColumns: async () => { await new Promise(resolve => { unregister = resolve; }); removed = true; }
    } } });
  vm.runInContext(source, context);
  const view = new context.Views();
  const pending = view.createCitationColumn().then(() => { finished = true; });
  await view.dispose();
  register(['late-column']);
  await new Promise(resolve => setImmediate(resolve));
  try {
    assert.equal(typeof unregister, 'function');
    assert.equal(finished, false, 'registration cannot finish while the late native column still exists');
  } finally { unregister?.(); await pending; }
  assert.equal(removed, true);
  assert.equal(view._registeredColumnKeys.size, 0);
});

test('view disposal still releases patches and columns when a DOM cleanup throws', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/views.mjs'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export default Views;', 'globalThis.Views = Views;');
  const calls = [], errors = [];
  const context = vm.createContext({ config: { addonID: 'test' },
    Zotero: { logError: error => errors.push(error.message), ItemTreeManager: {
      async unregisterColumns(keys) { calls.push('columns:' + keys.join(',')); }
    } } });
  vm.runInContext(source, context);
  const view = new context.Views({ document: { removeEventListener() { throw new Error('closed window'); } } });
  view._dragEndHandler = () => {};
  view._iconNodeStates.set({}, {});
  view._restoreIconNode = () => { throw new Error('detached icon'); };
  view._patchDisposers.push(() => { calls.push('patch-one'); throw new Error('patch failure'); }, () => calls.push('patch-two'));
  view._registeredColumnKeys.add('citation');
  await view.dispose();
  assert.deepEqual(calls, ['patch-one', 'patch-two', 'columns:citation']);
  assert.deepEqual(errors, ['closed window', 'detached icon', 'patch failure']);
  assert.equal(view._window, null);
  assert.equal(view._iconNodeStates.size, 0);
  await view.dispose();
  assert.equal(calls.length, 3);
});

test('production runtime contains no unused toolkit, debug bridges, or inline event handlers', () => {
  const code = fs.readFileSync(path.join(__dirname, '../chrome/content/scripts/index.js'), 'utf8');
  assert.doesNotMatch(code, /ToolkitGlobal|initializeDebugBridge|initializePluginBridge|GuideHelper|PromptManager|ownerGlobal|oncommand|zotero-plugin-toolkit/);
  const graph = JSON.parse(fs.readFileSync(path.join(__dirname, '../dist/build-metafile.json'), 'utf8'));
  assert.ok(Object.keys(graph.inputs).every(file => file.startsWith('src/')));
});

test('retained host wrappers become transparent after cleanup and preserve receiver and arguments', async () => {
  const { NativeRuntime } = await import('../src/runtime.mjs');
  const runtime = new NativeRuntime();
  const receiver = { calls: 0, run(a, b) { this.calls++; return a + b; } };
  const original = receiver.run;
  runtime.patch(receiver, 'run', 'test', native => function(a, b) { return native.call(this, a, b) * 10; });
  const inner = receiver.run;
  receiver.run = function(...args) { return inner.apply(this, args); };
  assert.equal(receiver.run(2, 3), 50);
  runtime.unregisterAll();
  assert.equal(receiver.run(2, 3), 5);
  assert.equal(receiver.calls, 2);
  assert.equal(runtime.pendingPatchCount, 0);
  assert.notEqual(receiver.run, original, 'successor wrapper must be retained');
  runtime.unregisterAll();
  assert.equal(receiver.run(3, 4), 7);
});

test('shutdown awaits resources and continues after independent cleanup failures', async () => {
  const code = fs.readFileSync(path.join(__dirname, '../chrome/content/scripts/index.js'), 'utf8');
  const start = code.indexOf('  // src/hooks.mjs');
  const end = code.indexOf('  // src/runtime.mjs', start);
  assert.ok(start > 0 && end > start);
  const calls = [];
  const addon = { data: { alive: true,
    views: { async dispose() { calls.push('dispose'); throw Error('dispose failed'); } },
    citation: { async clear() { calls.push('clear'); throw Error('clear failed'); } }
  } };
  const context = vm.createContext({ addon, console,
    runtime: { async unregisterAll() { await Promise.resolve(); calls.push('restore'); } },
    config: { addonInstance: 'ZoteroCitation' },
    Zotero: { ZoteroCitation: addon, logError() {} }
  });
  vm.runInContext(code.slice(start, end) + '; globalThis.hooks = hooks_default;', context);
  await context.hooks.onShutdown();
  await context.hooks.onShutdown();
  assert.deepEqual(calls, ['dispose', 'clear', 'restore']);
  assert.equal(addon.data.alive, false);
  assert.equal('ZoteroCitation' in context.Zotero, false);
});
