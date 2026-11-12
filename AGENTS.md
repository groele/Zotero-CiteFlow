# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Overview

"Zotero CiteFlow" (package name `zotero-citeflow`, add-on ID `citeflow@groele`) is a Zotero plugin that tracks citations in Microsoft Word documents, maintains plugin-managed citation tags, provides direct drag-and-drop citation, and displays real-time citation ordinals and texts in Zotero item tree views.

Target: Developed and perfected based on Zotero 10, forward-looking for future versions and upcoming platform features, with declared compatibility across Zotero 10.0-12.* (`strict_min_version: "10.0"`, `strict_max_version: "12.*"`). Build output targets Firefox 140+ / Gecko 153+ modern architecture. Node v22.14+ required for development; tests use Node’s experimental TypeScript stripping for source-level tests.

## Repository Source of Truth

The maintained CiteFlow source is the repository root, on local `main` tracking `origin/main`.
The main and preferences entry points are `src/index.ts` and `src/preferences.ts`, bundled with esbuild into `chrome/content/scripts/index.js` and `chrome/content/preferences.js`.
Package assets are defined in `scripts/build.ps1` and `package.json`.

## Commands

```bash
# Run architecture & compliance guard (enforces 360-line ceiling, Fluent symmetry, etc.)
npm run guard              # node scripts/architecture-guard.mjs

# Build bundled runtime script (typecheck + guard + esbuild)
npm run build              # tsc --noEmit && npm run guard && node scripts/build-source.mjs

# Run full test suite (builds first, then executes all Node tests with native TypeScript stripping)
npm test                   # npm run build && node --experimental-strip-types --test tests/*.test.*

# Package production XPI
npm run package            # pwsh -NoProfile -File scripts/build.ps1

# Self-test SemVer release tag validation
python scripts/release-tags.py --self-test
```

## Architecture & Compliance Guards

CiteFlow aligns with MetaFlow and MindFlow as an architectural benchmark, enforcing 13 automated rules in `scripts/architecture-guard.mjs` against `scripts/architecture-baseline.json`:
- **§5.9 360-Line Ceiling**: Every source file in `src/` must remain <= 360 lines. Baseline declares `debtCleared: true` and 0 oversized modules.
- **§5.2 TypeScript Purity & Strict Compiler**: 100% of files in `src/` are `.ts`/`.tsx`. Strict compiler enabled (`strict`, `noEmit`, `isolatedModules`, `verbatimModuleSyntax`). Zero `@ts-nocheck` exemptions.
- **§5.2 Typed Composition over Regex Class Slicing**: Modules compose via typed property descriptors (`composeDomains`).
- **§3 Fluent Symmetry & Zero Hardcoded UI Text**: `en-US` and `zh-CN` catalogues are 100% symmetric with zero duplicates; `preferences.xhtml` is 100% `data-l10n-id` driven.
- **§3 Naming Governance**: No version-prefixed filenames (`v40`, `V12_`, `temp-`).
- **§4.1 Full Preference Coverage**: Every preference in `prefs.js` is mapped in `preferences.ts` and mounted in `preferences.xhtml`.
- **§4.2 Layout Grid Standard**: `preferences.css` strictly enforces the 16px/24px/40px three-level hierarchy.
- **§5.3 Deprecated API Ban**: Zero `Cu.import`, `Components.classes`, or legacy boolean `setAttribute` calls.
- **§6 Version Parity**: `manifest.json`, `package.json`, `package-lock.json`, `docs/brand/product.json`, and `update.json` are byte-aligned.
- **§9 Update Feed Integrity**: `update.json` validated with HTTPS links and SHA-512 hashes.

## Architecture & Module Structure

CiteFlow follows a modular, decoupled architecture:

1. **Bootstrap (`bootstrap.js`)**:
   Standard Zotero bootstrap entry. Registers chrome resources (`chrome://zoterocitation/`), disables legacy add-on instances (`zoterocitation@polygon.org`) before migration, and loads `chrome/content/scripts/index.js`.
2. **Runtime & Hooks (`src/index.ts`, `src/hooks.ts`, `src/runtime.ts`)**:
   - `NativeRuntime`: Host adapter providing safe patch wrappers (`runtime.patch(owner, key, ref, wrapper)`) with automatic reference counting and unregistering.
   - `hooks.ts`: Manages lifecycle (`onStartup`, `onShutdown`, `onMainWindowLoad`, `onMainWindowUnload`). Binds windows safely without mutating `globalThis`.
3. **Citation Coordinator (`src/modules/citation.ts` & `src/modules/citation/*.ts`)**:
   Partitioned into 10 composed domain modules plus typed state/contract/helper modules (all <= 360 lines):
   - `src/modules/citation/constants.ts`: Temporary collection relation markers & preference keys
   - `src/modules/citation/state-contract.ts`, `session-contract.ts`, `formatting-contract.ts`, `word-contract.ts`: Shared internal state and helper contracts
   - `src/modules/citation/initializers.ts`: Subsystem initializers (`_initSessionTracking`, `_initDiagnosticsAndTelemetry`, `_bindPublicApi`, `_initPreferencesAndConfig`, `_initWordIntegrationState`, `_initTimersAndDebounce`)
   - `src/modules/citation/telemetry.ts`: Telemetry, metrics & health diagnostics (`logError`, `_bumpDebugCounter`, `_recordPerf`, `assertHealth`, `getHealthSummary`, `getPerformanceStats`, `_sanitizeCheckWaitMs`)
   - `src/modules/citation/preferences-sync.ts`: Configuration & state serialization (`applyPreferences`, `_loadKeySet`, `_loadManagedTagState`, `_loadLegacyManagedTagState`, `_saveManagedTagIDs`)
   - `src/modules/citation/document-naming.ts`: Document name sanitization, multiset fallback matching & path disambiguation (`_sanitizeFolderName`, `_getDocumentDisplayName`, `_getUniqueCollectionDisplayName`, `_getPendingCollectionName`, `_invalidateSessionIndex`, `_setActiveSessionID`)
   - `src/modules/citation/collections.ts`: Temporary collection lifecycle & cleanup (`clearStaleArtifacts`, `_clearStaleTemporaryCollections`, `_clearStaleManagedTags`, `initCollection`, `syncCollectionItems`, `_renameCollection`)
   - `src/modules/citation/word-integration.ts` & `src/modules/citation/session-sync-helpers.ts`: Word process hooks, polling engine, foreground `activeSessionID` sync & adaptive idle backoff (`listener`, `_pruneMissingWordSessions`, `_syncActiveWordSessions`, `_installWordIntegrationHooks`, `_createGetSessionWrapper`, `_createExecCommandWrapper`, `_handlePostExecCommand`, `ensureSession`)
   - `src/modules/citation/order-cache.ts`: Citation order calculation & signature cache (`getSortedItemIDs`, `_getSortedCache`, `_setSortedCache`, `cleanupSessionState`)
   - `src/modules/citation/tag-governance.ts`: Citation tag governance & read-only protection (`syncCitationTags`, `_syncCitationTags`, `_syncActiveItemCitationTag`, `_removeUncitedManagedItemTag`, `scheduleCitationTagSync`, `_isWritableCitationItem`)
   - `src/modules/citation/formatting.ts` & `src/modules/citation/refresh-helpers.ts`: Citation plain-text formatting, snapshot dirty-check fingerprinting & targeted ItemTree row invalidation (`updateCitations`, `_applyCitations`, `_formatItemPlainCitation`, `refreshSessionCitations`, `_readSessionCitationSnapshots`, `_handleEmptyCitationSnapshot`, `scheduleItemsViewRefresh`)
   - `src/modules/citation/lifecycle.ts`: Lifecycle teardown & resource disposal (`clear`, `_performClear`, `_restoreWordIntegrationHooks`, `_resetInternalTrackingMaps`)
4. **UI & Window View Adapter (`src/modules/views.ts`, `src/modules/views/*.ts`, `src/modules/cite.ts`, `src/modules/drop-target.ts`)**:
   - `src/modules/views/session-index.ts`: Session lookup index & `getCitationText` resolution (`_getSessionIndex`, `_resolveSelectedCollectionSessions`, `getCitationText`)
   - `src/modules/views/column-manager.ts`: Column metadata lookup (`getColumnInfo`)
   - `src/modules/views/window-prep.ts`: Item tree readiness & empty-library guard (`prepareWindow`)
   - `src/modules/views/drag-cite.ts`: Drag-and-drop Word citation handler (`dragCite`, `_resolveDropTarget`, `_notifyUnknownDropTarget`)
   - `src/modules/views/icon-patch.ts`: Word collection icon customization & DOM restoration (`patchIcon`, `_rememberIconNode`, `_restoreIconNode`)
5. **Preferences (`src/modules/preferences.ts`, `chrome/content/preferences.*`)**:
   - Strictly conforms to the **2026-11-02 Settings Three-Level Hierarchy and Edge Distance Standard Specification**:
     - Card container horizontal baseline: `x = 0px`, standard `padding-inline: 16px`;
     - Level 1 card header: full-width background `margin: -16px; padding: 12px 16px;`;
     - Level 2 main controls: establish **40px golden alignment line** (`16px icon + 8px gap`);
     - Level 3 subordinate descriptions and controls: enforce `margin-inline-start: 24px` aligned to the `40px` line.
   - All text localized via Fluent (`locale/**/zoterocitation-addon.ftl`), with zero hardcoded Chinese in xhtml.

## Coding and Release Standards

- **Version Alignment**: Every functional change must bump the version according to SemVer (patch/minor). Keep `package.json`, `manifest.json`, `docs/brand/product.json`, and `update.json` synchronized.
- **Annotated Tags**: Tags must follow `vMAJOR.MINOR.PATCH`. Create annotated tags (`git tag -a vX.Y.Z -m "vX.Y.Z"`).
- **Safety**: Never destroy user libraries or manual tags. Always check `item.isEditable()` before mutating items.
