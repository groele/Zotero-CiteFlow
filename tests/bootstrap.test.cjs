const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'bootstrap.js'), 'utf8');

function bootEnvironment({ loadError, shutdownError, flushError } = {}) {
  const calls = [];
  const addon = { hooks: { onShutdown: async () => {
    calls.push('addon shutdown');
    if (shutdownError) throw shutdownError;
  } } };
  const zotero = {
    initializationPromise: Promise.resolve(),
    ZoteroCitation: addon,
    logError: (message) => calls.push(`error: ${message}`),
  };
  const context = vm.createContext({
    Zotero: zotero,
    Services: {
      io: { newURI: (uri) => uri },
      scriptloader: { loadSubScript: () => {
        calls.push('load script');
        if (loadError) throw loadError;
      } },
      obs: { notifyObservers: () => calls.push('invalidate cache') },
    },
    Components: {
      classes: { '@mozilla.org/addons/addon-manager-startup;1': {
        getService: () => ({ registerChrome: () => {
          calls.push('register chrome');
          return { destruct: () => calls.push('destruct chrome') };
        } }),
      } },
      interfaces: { amIAddonManagerStartup: {}, nsIStringBundleService: {} },
    },
    Cc: { '@mozilla.org/intl/stringbundle;1': {
      getService: () => ({ flushBundles: () => {
        calls.push('flush bundles');
        if (flushError) throw flushError;
      } }),
    } },
    Cu: { unload: (uri) => calls.push(`unload ${uri}`) },
    ADDON_DISABLE: 4,
    APP_SHUTDOWN: 2,
  });
  vm.runInContext(source, context, { filename: 'bootstrap.js' });
  const data = { rootURI: 'file:///citation/' };
  return { context, calls, data };
}

test('startup releases chrome registration when the bundle fails to load', async () => {
  const { context, calls, data } = bootEnvironment({ loadError: new Error('bad bundle') });
  await context.startup(data, 1);
  assert.deepEqual(calls.slice(0, 3), ['register chrome', 'load script', 'error: Failed to startup ZoteroCitation addon: Error: bad bundle']);
  assert.equal(calls.filter((call) => call === 'destruct chrome').length, 1);
});

test('shutdown completes each cleanup step when addon shutdown and bundle flush fail', async () => {
  const { context, calls, data } = bootEnvironment({
    shutdownError: new Error('shutdown failed'),
    flushError: new Error('flush failed'),
  });
  await context.startup(data, 1);
  await context.shutdown(data, 4);
  assert.ok(calls.includes('invalidate cache'));
  assert.ok(calls.includes('addon shutdown'));
  assert.ok(calls.includes('unload file:///citation/chrome/content/scripts/index.js'));
  assert.equal(calls.filter((call) => call === 'destruct chrome').length, 1);
  assert.ok(calls.some((call) => call.includes('shutdown failed')));
  assert.ok(calls.some((call) => call.includes('flush failed')));
});

test('normal startup and shutdown release a single registration', async () => {
  const { context, calls, data } = bootEnvironment();
  await context.startup(data, 1);
  await context.shutdown(data, 4);
  assert.equal(calls.filter((call) => call === 'register chrome').length, 1);
  assert.equal(calls.filter((call) => call === 'destruct chrome').length, 1);
  assert.equal(calls.filter((call) => call.startsWith('unload ')).length, 1);
});
