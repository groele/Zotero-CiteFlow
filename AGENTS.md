# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Overview

"Zotero CiteFlow" (package name `zotero-citeflow`, add-on ID `citeflow@groele`) is a Zotero plugin that tracks citations in Microsoft Word documents, maintains plugin-managed citation tags, provides direct drag-and-drop citation, and displays real-time citation ordinals and texts in Zotero item tree views.

Target: Developed and perfected based on Zotero 10, forward-looking for future versions and upcoming platform features, with declared compatibility across Zotero 10.0-12.* (`strict_min_version: "10.0"`, `strict_max_version: "12.*"`). Build output targets Firefox 140+ / Gecko 153+ modern architecture. Node v22+ required for development.

## Repository Source of Truth

The maintained CiteFlow source is the repository root, on local `main` tracking `origin/main`.
The entry point is `src/index.mjs`, bundled with esbuild into `chrome/content/scripts/index.js`.
Package assets are defined in `scripts/build.ps1` and `package.json`.

## Commands

```bash
# Build bundled runtime script
npm run build              # node scripts/build-source.mjs

# Run full test suite (builds first, then executes node test runner)
npm test                   # node scripts/build-source.mjs && node --test tests/*.test.*

# Package production XPI
npm run package            # pwsh -NoProfile -File scripts/build.ps1

# Self-test SemVer release tag validation
python scripts/release-tags.py --self-test
```

## Architecture & Module Structure

CiteFlow follows a modular, decoupled architecture:

1. **Bootstrap (`bootstrap.js`)**:
   Standard Zotero bootstrap entry. Registers chrome resources (`chrome://zoterocitation/`), disables legacy add-on instances (`zoterocitation@polygon.org`) before migration, and loads `chrome/content/scripts/index.js`.
2. **Runtime & Hooks (`src/index.mjs`, `src/hooks.mjs`, `src/runtime.mjs`)**:
   - `NativeRuntime`: Host adapter providing safe patch wrappers (`runtime.patch(owner, key, ref, wrapper)`) with automatic reference counting and unregistering.
   - `hooks.mjs`: Manages lifecycle (`onStartup`, `onShutdown`, `onMainWindowLoad`, `onMainWindowUnload`). Binds windows safely without mutating `globalThis`.
3. **Citation Coordinator (`src/modules/citation.mjs` & `src/modules/citation/*.mjs`)**:
   Partitioned into 11 focused, single-responsibility domain modules (all under 350 lines):
   - `src/modules/citation/constants.mjs`: Temporary collection relation markers & preference keys
   - `src/modules/citation/initializers.mjs`: Subsystem initializers (`_initSessionTracking`, `_initDiagnosticsAndTelemetry`, `_bindPublicApi`, `_initPreferencesAndConfig`, `_initWordIntegrationState`, `_initTimersAndDebounce`)
   - `src/modules/citation/telemetry.mjs`: Telemetry, metrics & health diagnostics (`logError`, `_bumpDebugCounter`, `_recordPerf`, `assertHealth`, `getHealthSummary`, `getPerformanceStats`, `_sanitizeCheckWaitMs`)
   - `src/modules/citation/preferences-sync.mjs`: Configuration & state serialization (`applyPreferences`, `_loadKeySet`, `_loadManagedTagState`, `_loadLegacyManagedTagState`, `_saveManagedTagIDs`)
   - `src/modules/citation/document-naming.mjs`: Document name sanitization & formatting (`_sanitizeFolderName`, `_getDocumentDisplayName`, `_getPendingCollectionName`, `_invalidateSessionIndex`, `_setActiveSessionID`)
   - `src/modules/citation/collections.mjs`: Temporary collection lifecycle & cleanup (`clearStaleArtifacts`, `_clearStaleTemporaryCollections`, `_clearStaleManagedSearches`, `initCollection`, `syncCollectionItems`, `_renameCollection`)
   - `src/modules/citation/word-integration.mjs`: Word process hooks & polling engine (`listener`, `_pruneMissingWordSessions`, `_syncActiveWordSessions`, `_installWordIntegrationHooks`, `_createGetSessionWrapper`, `_createExecCommandWrapper`, `_handlePostExecCommand`, `ensureSession`)
   - `src/modules/citation/order-cache.mjs`: Citation order calculation & signature cache (`getSortedItemIDs`, `_getSortedCache`, `_setSortedCache`, `cleanupSessionState`)
   - `src/modules/citation/tag-governance.mjs`: Citation tag governance & read-only protection (`syncCitationTags`, `_syncCitationTags`, `_syncActiveItemCitationTag`, `_removeUncitedManagedItemTag`, `scheduleCitationTagSync`, `_isWritableCitationItem`)
   - `src/modules/citation/formatting.mjs`: Citation plain-text formatting & tree view refresh (`updateCitations`, `_applyCitations`, `_formatItemPlainCitation`, `refreshSessionCitations`, `_readSessionCitationSnapshots`, `_handleEmptyCitationSnapshot`, `scheduleItemsViewRefresh`)
   - `src/modules/citation/lifecycle.mjs`: Lifecycle teardown & resource disposal (`clear`, `_performClear`, `_restoreWordIntegrationHooks`, `_resetInternalTrackingMaps`)
4. **UI & Window View Adapter (`src/modules/views.mjs`, `src/modules/views/*.mjs`, `src/modules/cite.mjs`, `src/modules/drop-target.mjs`)**:
   - `src/modules/views/session-index.mjs`: Session lookup index & `getCitationText` resolution (`_getSessionIndex`, `_resolveSelectedCollectionSessions`, `getCitationText`)
   - `src/modules/views/column-manager.mjs`: Column metadata lookup (`getColumnInfo`)
   - `src/modules/views/window-prep.mjs`: Item tree readiness & empty-library guard (`prepareWindow`)
   - `src/modules/views/drag-cite.mjs`: Drag-and-drop Word citation handler (`dragCite`, `_resolveDropTarget`, `_notifyUnknownDropTarget`)
   - `src/modules/views/icon-patch.mjs`: Word collection icon customization & DOM restoration (`patchIcon`, `_rememberIconNode`, `_restoreIconNode`)
5. **Preferences (`src/modules/preferences.mjs`, `chrome/content/preferences.*`)**:
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
