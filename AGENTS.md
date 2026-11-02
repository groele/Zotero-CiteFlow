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
3. **Citation Coordinator (`src/modules/citation.mjs`)**:
   Lightweight Facade that orchestrates specialized subsystems:
   - `word-integration.mjs`: Transparently hooks `Zotero.Integration.execCommand` and `getSession`, resolves active Word document names, and monitors sessions.
   - `citation-model.mjs`: Pure algorithm calculating document order (`getSortedItemIDs`), session cache with cryptographic signatures, and citation plain-text formatting (note style vs inline).
   - `collection-manager.mjs`: Manages temporary Word document collections, transactionally synchronizes item changes, and safely purges stale or orphan artifacts without touching user data.
   - `tag-manager.mjs`: Maintains `/Citations` tags on cited user-library items, respects `item.isEditable()` and read-only libraries, manages rollback on save failure, and handles tag renames.
   - `diagnostics.mjs`: Telemetry, diagnostics, health checks, and slow-operation thresholds.
4. **UI & Window View Adapter (`src/modules/views.mjs`, `src/modules/cite.mjs`, `src/modules/drop-target.mjs`)**:
   - `createCitationColumn`: Registers native custom column in `Zotero.ItemTreeManager`.
   - `dragCite`: Listens to item drag events, verifies drop target via `resolveWordDropTarget` (Windows Win32 ctypes), and triggers citation insertion.
   - `patchIcon`: Customizes Word collection icon in collections tree.
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
