import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Citation, CITATION_DOMAIN_MODULES } from "../src/modules/citation.mjs";
import Views from "../src/modules/views.mjs";
import { ViewsSessionIndex } from "../src/modules/views/session-index.mjs";
import { ViewsColumnManager } from "../src/modules/views/column-manager.mjs";
import { ViewsWindowPrep } from "../src/modules/views/window-prep.mjs";
import { ViewsDragCite } from "../src/modules/views/drag-cite.mjs";
import { ViewsIconPatch } from "../src/modules/views/icon-patch.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function collectSourceFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(mjs|js)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

test("no source module in src/ has monolithic code pileup (> 360 lines)", () => {
  const srcFiles = collectSourceFiles(path.join(root, "src"));
  assert.ok(srcFiles.length >= 27, `Expected at least 27 modular source files, found ${srcFiles.length}`);
  for (const filePath of srcFiles) {
    const rel = path.relative(root, filePath).replace(/\\/g, "/");
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).length;
    assert.ok(
      lines <= 360,
      `Source module ${rel} has ${lines} lines, exceeding the 360-line modular maintainability limit`
    );
  }
});

test("Citation domain modules partition all 72 prototype methods without collision", () => {
  assert.equal(CITATION_DOMAIN_MODULES.length, 10);
  const seenMethods = new Map();

  for (const DomainClass of CITATION_DOMAIN_MODULES) {
    const names = Object.getOwnPropertyNames(DomainClass.prototype).filter(
      name => name !== "constructor"
    );
    assert.ok(names.length > 0, `${DomainClass.name} must define domain methods`);
    for (const name of names) {
      assert.equal(
        seenMethods.has(name),
        false,
        `Method ${name} is duplicated between ${seenMethods.get(name)} and ${DomainClass.name}`
      );
      seenMethods.set(name, DomainClass.name);
      assert.equal(
        typeof Citation.prototype[name],
        "function",
        `Citation.prototype.${name} must be composed from ${DomainClass.name}`
      );
    }
  }

  // Verify decomposed helper methods exist on Citation.prototype
  const expectedDecomposedHelpers = [
    "_sanitizeCheckWaitMs",
    "_loadLegacyManagedTagState",
    "_clearStaleTemporaryCollections",
    "_clearStaleManagedSearches",
    "_pruneMissingWordSessions",
    "_syncActiveWordSessions",
    "_createGetSessionWrapper",
    "_createExecCommandWrapper",
    "_handlePostExecCommand",
    "_hasItemTag",
    "_resolveItemByID",
    "_collectActiveCitedIDSet",
    "_syncActiveItemCitationTag",
    "_removeUncitedManagedItemTag",
    "_readSessionCitationSnapshots",
    "_handleEmptyCitationSnapshot",
    "_formatItemPlainCitation",
    "_restoreWordIntegrationHooks",
    "_resetInternalTrackingMaps"
  ];
  for (const helper of expectedDecomposedHelpers) {
    assert.equal(
      typeof Citation.prototype[helper],
      "function",
      `Expected decomposed helper ${helper} on Citation.prototype`
    );
  }
});

test("Views domain modules partition view responsibilities without collision", () => {
  const viewDomains = [
    ViewsSessionIndex,
    ViewsColumnManager,
    ViewsWindowPrep,
    ViewsDragCite,
    ViewsIconPatch
  ];
  const seenMethods = new Map();

  for (const DomainClass of viewDomains) {
    const names = Object.getOwnPropertyNames(DomainClass.prototype).filter(
      name => name !== "constructor"
    );
    assert.ok(names.length > 0, `${DomainClass.name} must define view domain methods`);
    for (const name of names) {
      assert.equal(
        seenMethods.has(name),
        false,
        `View method ${name} is duplicated between ${seenMethods.get(name)} and ${DomainClass.name}`
      );
      seenMethods.set(name, DomainClass.name);
      assert.equal(
        typeof Views.prototype[name],
        "function",
        `Views.prototype.${name} must be composed from ${DomainClass.name}`
      );
    }
  }
  assert.equal(typeof Views.prototype._resolveSelectedCollectionSessions, "function");
  assert.equal(typeof Views.prototype.createCitationColumn, "function");
  assert.equal(typeof Views.prototype.dispose, "function");
});
