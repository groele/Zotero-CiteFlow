<div align="center">

<img src="chrome/content/icons/citeflow.svg" alt="Zotero CiteFlow Logo" width="96" height="96" />

# Zotero CiteFlow

**Zotero Flow Series · Citation**

*让研究的每一步衔接起来。 / Connect each step of research.*

Track Word citations and connect them to Zotero items.

[简体中文](README.md) · [English](README.en.md)

[![Release](https://img.shields.io/badge/version-16.2.2-245ac7?style=flat-square)](https://github.com/groele/Zotero-CiteFlow/releases/tag/v16.2.2) · [Download XPI](https://github.com/groele/Zotero-CiteFlow/releases/download/v16.2.2/zotero-citeflow-16.2.2.xpi) · [Report an issue](https://github.com/groele/Zotero-CiteFlow/issues)

![Zotero 10.0–12.*](https://img.shields.io/badge/Zotero-10.0--12.*-2f855a?style=flat-square)
![License AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0--only-64748b?style=flat-square)
![Tests 93 Passed](https://img.shields.io/badge/tests-93%20unit%2Fintegration%20%7C%2013%20guards-0d9488?style=flat-square)

</div>

---

[Overview](#overview) · [Installation & Updates](#installation) · [Quick Start](#quick-start) · [Key Features Deep Dive](#features) · [CSL Style Reference Case](#csl-example) · [Full Settings Reference](#settings) · [Data, Sync & Security](#data) · [Compatibility & Validation](#compatibility) · [Troubleshooting](#troubleshooting) · [Architecture & Development](#development) · [The Flow Series](#series) · [Origin & License](#license)

<a id="overview"></a>

## 📖 Overview

When writing a thesis, journal manuscript, or multiple parallel reviews, writers often lose sight of three practical details: which papers in their Zotero library have already entered the active Word draft, how cited sets differ across multiple open documents, and how to insert references directly without accidentally pasting static plain text instead of editable Zotero CSL fields.

**Zotero CiteFlow** (`citeflow@groele`) is built for writers working with Zotero and **Microsoft Word**:
- Surfaces recognized Word **citation ordinals and short citation texts** right in Zotero’s item list;
- Maintains per-document **temporary collections** in your personal library positioned neatly immediately above **My Publications**;
- Applies **ownership-tracked, read-only-safe citation tags** (default `/Citations`) to cited personal-library items;
- On Windows, verifies cursor targets (`WINWORD.EXE`) natively so dragging Zotero items into a Word page inserts standard, refreshable **Zotero CSL citation fields** without mutating existing document fields.

> [!NOTE]
> CiteFlow can be installed completely standalone or combined with other [Zotero Flow Series](#series) add-ons as needed. It runs 100% locally inside Zotero with zero network requests.

---

<a id="installation"></a>

## 📦 Installation and Updates

### Installing Release `v16.2.2`

1. Download [**`zotero-citeflow-16.2.2.xpi`**](https://github.com/groele/Zotero-CiteFlow/releases/download/v16.2.2/zotero-citeflow-16.2.2.xpi) (add-on version **16.2.2**). Do **not** install GitHub’s `Source code (zip)` archive.
2. Open Zotero and navigate to **Tools → Plugins/Add-ons**.
3. Open the gear menu in the top-right corner, choose **Install Add-on From File…**, select the downloaded `.xpi`, and restart Zotero when prompted.

### Package Integrity Checksums (`16.2.2`)

| Field | Value |
|---|---|
| Asset Filename | `zotero-citeflow-16.2.2.xpi` (`98,761` bytes, 20 ZIP entries) |
| SHA-256 | `58ED767983502BA75EBF70F60939A4340554E4251D07D27D569E379689C0ED35` |
| SHA-512 | `1b0fbe2b6ae0a6a597e9e062660a2027e435e595aaa595029a42aa857ff8ca3144d61c43703d8e1b97271d51182cb7e70ec280e0e39f979b64964c6f0b48e960` |

### Legacy Migration & Update Feed

- **Automatic Disabling of Legacy Upstream Conflicts**: If the legacy `zoterocitation@polygon.org` add-on was previously installed, [`bootstrap.js`](bootstrap.js) detects and disables it before loading CiteFlow’s bundle to prevent concurrent Word Integration wrapping or handler collisions, while safely reading legacy ownership keys without harming manual tags.
- **Update Feed**: [update.json](update.json) · Add-on ID: `citeflow@groele` · Declared Zotero compatibility: `10.0` through `12.*`. Always back up important library data before major upgrades.

---

<a id="quick-start"></a>

## 🚀 Quick Start (4 Steps)

1. **Enable the “Citation” Column**: Right-click any column header in Zotero’s main item list and check **Citation**.
2. **Connect a Word Document**: Open a `.docx` file containing Zotero citations in Microsoft Word (or perform a Zotero toolbar action in Word once to establish/refresh a `Zotero.Integration` session).
3. **Inspect Three Synchronized Signals**:
   - **Item List “Citation” Column**: Displays normalized ordinals and citation text (e.g., `[1] Vaswani et al., 2017`);
   - **Personal Library Temporary Collection**: Appears in the left tree under **My Library** immediately above **My Publications**, named after the active document (with parent-folder qualifiers such as `paper.docx (Chapter1)` when filenames collide across directories);
   - **Automatic Citation Tag**: Automatically tags cited personal-library items with `/Citations` (customizable in Settings).
4. **Drag-to-Cite Directly into Word (Windows)**: Select one or more regular items in Zotero and drop them onto an open Microsoft Word document page to insert an editable CSL citation field at the cursor. Dragging items onto Zotero’s own collections or Trash retains native Zotero move semantics intact.

---

<a id="features"></a>

## ✨ Key Features Deep Dive

### Feature Matrix & Boundaries

| Capability | Problem Solved | Implementation & Real Boundary |
|---|---|---|
| **Word Citation Status & P1-B Foreground Sync** | Review exactly which items are cited and at what ordinal across parallel Word drafts. | Reads Zotero Word Integration snapshots; `v16.2.0` adds read-only foreground Win32 title matching to auto-sync `activeSessionID` only on unambiguous 1-to-1 matches; unrecognized states never claim an item has never been cited. |
| **Windows Native-Confirmed Drag-to-Cite** | Insert refreshable Zotero CSL citation fields instead of plain bibliography text on drop. | Enabled on Windows only after `dragend` confirms `WINWORD.EXE` under cursor; preserves `zotero/item` while stripping `text/html` and emptying `text/plain`; macOS/Linux retain native Quick Copy dragging untouched; WPS Writer is not supported. |
| **Personal Library Word Collections** | Filter Zotero’s item list immediately by active manuscript. | Created only inside **My Library** and pinned immediately above **My Publications**; supports parent-folder disambiguation (`name (ParentDir)`); never writes temporary collections into Group Libraries. |
| **Ownership-Tracked Tags & Read-Only Guard** | Filter cited papers without ever corrupting user-created manual tags or read-only groups. | Tracks plugin-owned tag associations persistently across multi-document unions; enforces `item.isEditable()` and trash/deleted filtering; skips read-only Group Libraries and trashed items cleanly. |
| **Snapshot Dirty-Checking & Row-Level Invalidation** | Prevent full-tree UI flicker and wasted formatting passes during background polls. | Computes deterministic input fingerprints to skip unchanged polls; uses targeted ItemTree row invalidation when safe and automatically falls back to full refresh under Citation-column sorting or large batch updates. |
| **Concurrent Protection & Lifecycle Self-Healing** | Prevent overlapping COM drag collisions, orphaned collections/tags, or dangling WinWord patches. | Throttled non-blocking busy notice (`>= 2000ms`) during in-flight drags; `finally` block restores native WinWord `getActiveDocument`; multi-window unload rebinding; startup orphan tag cleanup when no active sessions exist. |

---

### 1. Multi-Document Citation Tracking, P1-B Foreground Sync & Disambiguation

```text
  Microsoft Word (WINWORD.EXE) ──(Zotero Integration Session)──► CiteFlow Poller / Command Listener
             │                                                             │
             ├──► probeForegroundWordTitle() (Read-only Win32)             ├──► Unique match to 1 active session?
             │                                                             │     ├─ Yes ─► Sync activeSessionID & targeted refresh
             │                                                             │     └─ No / Zotero focused ─► Keep state, never guess
             └──► Unsaved draft ("Document1") / Save As .docx             └──► Multiset title guard ──► Rename collection in place
```

- **P1-B Foreground Word Session Synchronization (`v16.2.0`)**: Using [`probeForegroundWordTitle()`](src/modules/drop-target.ts) in [`src/modules/drop-target.ts`](src/modules/drop-target.ts) and [`syncForegroundActiveSession()`](src/modules/citation/session-sync-helpers.ts) in [`session-sync-helpers.ts`](src/modules/citation/session-sync-helpers.ts), switching focus among open Word documents automatically updates `activeSessionID` and triggers a targeted list refresh when the foreground Word title uniquely identifies a single tracked session. If multiple windows share a title or focus remains inside Zotero, CiteFlow refuses to guess.
- **In-Place Pending Naming & Multiset Window-Title Subtraction**: When Zotero starts an integration session before a file path exists (or after a random plugin-triggered session ID), CiteFlow names the collection `Word document (pending name) N` and renames it in place once a path arrives or visible `OpusApp` titles resolve unambiguously. In `v16.2.0`, `_resolveFallbackDocumentId()` replaces `new Set(...)` collapse with multiset subtraction so two identically titled open Word windows no longer cancel each other into a false unique match.
- **Same-Filename Path Disambiguation & Cloud URL Parsing**: When opening `D:\Thesis\Chapter1\draft.docx` alongside `D:\Thesis\Chapter2\draft.docx`, [`_getUniqueCollectionDisplayName()`](src/modules/citation/document-naming.ts) appends parent directory qualifiers (`draft.docx (Chapter1)`, `draft.docx (Chapter2)`). SharePoint/OneDrive URLs and filenames containing literal `%` characters are segment-decoded safely while rejecting encoded path separators.
- **Ordinal Determinism & Bidirectional Torn-Snapshot Guard**: [`order-cache.ts`](src/modules/citation/order-cache.ts) rejects non-numeric ordinal keys and invalid IDs, delays `50ms` on bidirectional snapshot mismatch before mutating cached state, and distinguishes all-trashed documents cleanly so deleted entries never occupy valid `[1], [2], [3]` ordinals.

### 2. Windows Editable CSL Drag-and-Drop (Preserving Native Drag Payloads)

- **Clean Separation Between Zotero Moves and Word Drops**: [`drag-cite.ts`](src/modules/views/drag-cite.ts) wraps `itemsView.onDragStart` only on Windows (`supportsNativeDropTarget()` === `true`):
  1. Invokes native `itemsView.onDragStart` first so internal `zotero/item` payloads remain intact when moving items to Zotero collections or Trash;
  2. Snapshots regular top-level non-trashed selected items (deduplicated by `item.id`);
  3. Removes `text/html` and clears `text/plain` only, preventing plain-text citation dumps into Word;
  4. On `dragend`, inspects the cursor position with cached Win32 `ctypes` bindings (`GetCursorPos`, `WindowFromPoint`, `GetWindowThreadProcessId`, `QueryFullProcessImageNameW` — deterministically closed on shutdown) and invokes [`addon.api.citeItems`](src/addon.ts) only when `word-confirmed`. Drops onto Explorer, browsers, or non-Word apps perform zero insertions.
- **Native Word Integration Injection & Cleanup**: [`src/modules/cite.ts`](src/modules/cite.ts) adapts `Zotero.Integration` around the active session to let Word emit genuine editable CSL fields (including Zotero 10’s `getDocument(null)` adapter compatibility) and restores every patched WinWord `application` instance inside `finally` via `restorePatchedApplications()`.
- **Throttled Concurrent Drag Busy Notice (`v16.2.0`)**: Triggering another drag before an in-flight Word COM operation returns displays a non-blocking, localized `Zotero.ProgressWindow` notice throttled to >= `2000ms` in [`src/addon.ts`](src/addon.ts) while leaving the locked SHA-256 baseline of `cite.ts` untouched.

### 3. Collection Tree Positioning & Decoupled Pipelines

- **Anchored Immediately Above “My Publications”**: Because Zotero 10 sorts collections by system locale (causing Chinese or numeric document titles to interleave unpredictably among normal folders), [`icon-patch.ts`](src/modules/views/icon-patch.ts) structurally reorders collection tree slices across open Zotero windows so CiteFlow Word collections always appear right after normal folders/saved searches and immediately above **My Publications (`publications`)**, preserving collapsed subfolders, selection focus, and own `isCollection` property descriptors.
- **Independent from Core Citation Tracking**: Disabling temporary collections atomically erases plugin-created collections via `eraseTx()` without interrupting item-list citation status, document identity resolution, or automatic citation tags; re-enabling backfills active cited items immediately from cached `session.idData`.

### 4. Ownership-Verified Tag Governance & Read-Only Safety

- **Zero Risk to Manual Tags**: CiteFlow tracks `_managedCitationTagIDs` persistently. Toggling automatic tags off or unciting a paper strips only tags created by CiteFlow and preserves every pre-existing manual tag—even with identical names.
- **Cross-Document Union & Safe Renaming**: If an item appears in both Word Document A and Document B, closing Document A keeps its citation tag intact. Renaming `/Citations` to custom text migrates plugin-managed tags smoothly while keeping other tags untouched.
- **Startup Orphan Cleanup & Read-Only Guards**: On startup, orphaned managed tags without any active session are cleaned safely; trashed, deleted, and read-only Group Library items are strictly skipped (`item.isEditable()`) without raising dirty write failures.

### 5. Incremental Dirty-Checking, Row-Level Invalidations & Adaptive Polling (`v16.2.0`)

- **Input Fingerprint Dirty-Checking ([`refresh-helpers.ts`](src/modules/citation/refresh-helpers.ts))**: [`buildRefreshInputFingerprint()`](src/modules/citation/refresh-helpers.ts) hashes snapshot signatures, tag settings, sort state, and active session status to short-circuit identical polling cycles, automatically invalidating caches upon collection recreation or sync failures.
- **Targeted ItemTree Row Invalidation**: Verified against Zotero `10.0.8`’s `itemTree.js` (`invalidateRowCache`, `getRowIndexByID`, `getSortField` / `getSortFields`, `tree.invalidateRow`), CiteFlow updates only modified item rows when Citation sorting is inactive and changed item counts remain small, falling back cleanly to `refreshAndMaintainSelection()` otherwise.
- **3s Window Probe Cooldown & Adaptive Idle Backoff ([`session-sync-helpers.ts`](src/modules/citation/session-sync-helpers.ts))**: Full background window enumeration obeys a `WINDOW_PROBE_COOLDOWN_MS = 3000` gate; after `5` consecutive idle ticks, the poller backs off smoothly up to `LISTENER_MAX_IDLE_INTERVAL_MS = 3000` and immediately resets upon `execCommand` completion (with overlap compensation), session changes, or title resolution.

---

<a id="csl-example"></a>

## 📄 CSL Style Reference Case: Compact Journal Reference

To meet strict page limits for top-tier journal and conference manuscripts (IEEE Transactions, ACM, Nature sub-journals, CVPR, ICCV, etc.), CiteFlow bundles and maintains an ultra-compact CSL 1.0.2 style authored by **Shikunhou**:

📁 **Style File**: [`csl/compact-journal-reference.csl`](csl/compact-journal-reference.csl)

| Dimension | Standard Format (e.g., APA / Full IEEE) | Compact Journal Reference |
|---|---|---|
| **In-text Citation** | Author-year `(Vaswani et al., 2017)` or loose brackets | Condensed numeric `[1]`, `[1, 2]`, `[1-4]` (auto-collapsed) |
| **Container Title** | Full title (frequently wraps lines) | Short italic (`form="short"`, e.g., *NeurIPS,*, *IEEE Trans. PAMI,*) |
| **Publication Year** | Parenthesized `(2017)` | **Bold** (e.g., **2017**) for instant scanning |
| **Volume & Pages** | Verbose labels `Vol. 30, no. 2, pp. 5998-6008` | Compact `30(2), 5998-6008` |
| **Spacing** | Wide paragraph gaps | Flush alignment (`second-field-align="flush"`), zero entry spacing |

- **Traditional Rendering (3–4 lines)**:
  > `[1] Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, Ł., & Polosukhin, I. (2017). Attention is all you need. In Advances in Neural Information Processing Systems (Vol. 30, pp. 5998–6008). Currans Associates, Inc.`
- **Compact Journal Reference (1 line, >60% vertical space saved)**:
  > `[1] Attention Is All You Need. NeurIPS, 2017, 30, 5998-6008.`

**How to Import**: Open Zotero → **Edit → Settings / Preferences → Cite → Styles** (macOS: **Zotero → Settings**), click **"+"** to import `compact-journal-reference.csl`, then choose **Compact Journal Reference** in your word processor’s **Zotero → Document Preferences**. *(Scope note: the `.csl` style file works anywhere Zotero CSL styles apply, whereas CiteFlow’s real-time citation tracking, temporary collections, and Windows drag-to-cite support Microsoft Word only, not WPS Writer.)*

---

<a id="settings"></a>

## ⚙️ Full Settings Reference

Open via **Zotero → Edit / Tools → Settings → Zotero CiteFlow** (on macOS: **Zotero → Settings → Zotero CiteFlow**).

- Organized in Zotero Flow’s five single-level collapsible cards adhering strictly to the **16px / 24px / 40px alignment grid** and 100% Fluent localization (`en-US` / `zh-CN`).
- **Auto-Save & Cross-Window Observer Sync**: Stored under `extensions.zotero.zoterocitation.*`; external Config Editor changes sync live, rapid edits coalesce cleanly by latest revision, and the settings pane remains accessible even when citation tracking is disabled.
- Clicking **Restore defaults** resets only these ten add-on preferences—preserving Word document citations, user manual tags, and all unrelated Zotero settings.

### All 10 Native Preferences

| Settings Card | Control Label | Preference Key (`extensions.zotero.zoterocitation.*`) | Default | Allowed Range / Rule | Effect Timing & Dependencies |
|---|---|---|---|---|---|
| **1. Core Tracking Service** | Enable CiteFlow citation tracking | `enable` | `true` | Boolean | **Requires Zotero restart**; when disabled, Word hooks/column/drag handlers stay unloaded while Settings stays active. |
| **2. Writing Interaction** | Enable drag citation | `dragCite.enable` | `true` | Boolean | **Immediate**; works even when Citation column is hidden. **Windows only**: disabled on macOS/Linux to keep native Quick Copy drag intact. |
| **3. Collections & Tag Governance** | Create temporary Word collections in tree | `collections.enable` | `true` | Boolean | **Immediate**; operates only in **My Library**. Turning off cleans plugin-managed collections without stopping column/tag tracking; turning on backfills active sessions. |
| **3. Collections & Tag Governance** | Automatically tag cited items | `citationTags.enable` | `true` | Boolean | **Immediate**; parent switch—disables **Citation tag text** input, clears invalid status, restores saved text, and removes only plugin-owned tags. |
| **3. Collections & Tag Governance** | Citation tag text | `citationTags.text` | `"/Citations"` | Nonempty `1–200` chars (no line breaks or ASCII control chars) | **Immediate**; trimmed on save. Migrates plugin-managed tags smoothly while keeping other/manual tags intact. |
| **4. Refresh and Performance** | Citation tag sync delay (ms) | `citationTagDebounceMs` | `150` | Integer `0` – `2000` | Applies to subsequent debounced tag sync batches; invalid input restores persisted value. |
| **4. Refresh and Performance** | Item list refresh delay (ms) | `itemsViewRefreshDebounceMs` | `120` | Integer `0` – `2000` | Applies to subsequent debounced tree refresh scheduling. |
| **4. Refresh and Performance** | Diagnostic time window (ms) | `healthWindowMs` | `300000` | Integer `10000` – `3600000` | Sliding window for runtime health summaries & telemetry counters (default 5 min). |
| **4. Refresh and Performance** | Slow operation threshold (ms) | `perfSlowThresholdMs` | `50` | Integer `5` – `5000` | Operations exceeding this duration are flagged in diagnostic performance stats. |
| **5. Diagnostics & Maintenance** | Enable debug logging | `debug` | `false` | Boolean | **Immediate**; writes CiteFlow trace entries into Zotero Debug Output (keep off for daily use). |

> [!TIP]
> The legacy apostrophe quick-cite shortcut (`quickCite.enable`) was permanently removed because cursor targets across multiple documents are inherently ambiguous; existing legacy user prefs under that key are ignored.

---

<a id="data"></a>

## 🔒 Data, Sync, and Privacy Boundaries

- **100% Local Execution**: Runs entirely inside the local Zotero process—**zero external servers, zero accounts, zero analytics or telemetry uploads**.
- **Local Preference Storage Only**: Ownership metadata (`_temporaryCollectionKeys`, `_managedTagIDs`) persists strictly inside local Zotero preferences (`extensions.zotero.zoterocitation.*`), reading legacy migration keys safely without altering unrelated database data.
- **No Unsolicited `.docx` Scanning or Rewriting**: CiteFlow reads session state through Zotero’s Word Integration API and injects new citations only at the active cursor on confirmed Windows drags—never scanning disk files independently or rewriting existing Word fields.
- **Group Library & Trash Protection**: Temporary collections never enter Group Libraries, and tags strictly enforce `item.isEditable()`, skipping read-only group items and trashed entries cleanly.

---

<a id="compatibility"></a>

## 🌐 Compatibility and Validation Scope

Declared compatibility ranges and verified evidence are kept strictly distinct:

| Layer | Status / Scope |
|---|---|
| **Current Add-on Version** | `16.2.2` |
| **Declared Zotero Range** | `10.0` through `12.*` (`manifest.json` & `update.json`) |
| **Runtime Target** | Strict TypeScript (`strict: true`), esbuild target `firefox140` / Gecko `153+`, unminified auditable bundles (`minify: false`), zero deprecated `Cu.import` / `Components.*` / `defaultIn` APIs |
| **`v16.2.2` Automated Verification** | • `tsc --noEmit`: `0` errors<br>• `scripts/architecture-guard.mjs`: **13/13** passed (all 37 TS files in `src/` `<= 360` lines, zero debt, `43` symmetric FTL keys, `10` synced preferences, `10` version alignments at `v16.2.2`)<br>• Full test suite (`npm test`): **93/93** passed (`tests/citeflow-fixes.test.mjs` 6 cases, `tests/enhancement-stability.test.mjs` 6 cases, `citation-stability` 25, `citation-data` 13, `citation-word` 10, locked `cite.ts` guard & SHA-256 baseline, etc.) |
| **Historical Isolated Desktop Acceptance (`v16.2.0`)** | `v16.2.0` previously ran [`scripts/test-settings-native.ps1`](scripts/test-settings-native.ps1) against `dist/zotero-citeflow-16.2.0.xpi` in real **Zotero `10.0.8`** isolated profiles (`zh-CN` 40/40, `en-US` 40/40 passed); `v16.2.2` did not re-run the desktop Zotero isolated launch smoke test. |
| **Historical Physical Word Baseline** | Windows + Zotero `10.0.6` + Microsoft Word `16.0.20430` physically verified regular-item drag insertion producing refreshable `ADDIN ZOTERO_ITEM CSL_CITATION` fields and zero insertions on Explorer drops ([CORE-TECHNICAL-MAINTENANCE.md](CORE-TECHNICAL-MAINTENANCE.md)). |
| **Explicit Unverified Boundaries** | `v16.2.2` has not yet undergone a live desktop Zotero settings smoke re-run or live dual-window physical **Microsoft Word (`WINWORD.EXE`)** interactive focus-switching and COM insertion testing in this session, nor physical certification on Zotero `11` / `12`, macOS Word, WPS Writer, LibreOffice, or main-profile migration. |

---

<a id="troubleshooting"></a>

## ❓ Troubleshooting

| Symptom | Likely Cause | Next Action |
|---|---|---|
| **Missing “Citation” column in Zotero item list** | Optional extension columns may start hidden or after first install. | Right-click any column header in Zotero’s main item list and check **Citation**. If `enable` was just turned on, restart Zotero. |
| **Collection named `Word document (pending name) N`** | Word integration session lacks a saved path yet (e.g., new unsaved `Document1`). | Save the Word file (`Ctrl+S`) or run a Zotero Word toolbar action once; CiteFlow renames the collection in place when the title uniquely resolves. |
| **Two Word documents share the same filename in different folders** | Basename alone cannot distinguish two drafts. | `v16.2.0` appends parent directory qualifiers (`draft.docx (Chapter1)` vs `draft.docx (Chapter2)`). If two open windows have identical titles (e.g., colliding unsaved names), CiteFlow refuses to guess; rename or refocus the target draft. |
| **“Could not confirm the Word drop target” notice on drag** | Cursor landed outside a `WINWORD.EXE` editing window (e.g., WPS Writer, browser, desktop, or Word chrome). | Ensure you are using **Microsoft Word** (not WPS Writer) and drop directly onto the **document page area**. If persistent, enable `debug` logging and attach your Word version. |
| **“Previous citation insertion is still in progress” notice** | An earlier COM drag-to-cite dialog/transaction in Word has not completed yet. | Non-blocking `v16.2.0` guard: wait briefly until the active Word field finishes or close any open Word citation prompt, then drag again. |
| **“Enable drag citation” is disabled on macOS / Linux** | Cursor target confirmation relies on Win32 `ctypes` (`GetCursorPos` / `WINWORD.EXE`). | Intentional platform safeguard: native Zotero dragging and Quick Copy stay untouched on macOS/Linux; use Word’s Zotero toolbar to insert while retaining CiteFlow column, collection, and tag tracking. |
| **No temporary collections/tags on Group Library items** | Collections only target **My Library**; read-only group and trashed items are write-protected. | Intentional data-safety boundary (`item.isEditable()`) preventing team library pollution. |
| **What to include in bug reports** | Needed for deterministic reproduction. | Open a [GitHub Issue](https://github.com/groele/Zotero-CiteFlow/issues) with CiteFlow/Zotero/Word versions, OS, document-switching steps, minimal repro, and sanitized debug logs. |

---

<a id="development"></a>

## 🛠️ Architecture & Development

CiteFlow uses strict **TypeScript typed composition (`composeDomains`) + unminified esbuild bundling (`minify: false`)**:

```text
github-sources/Zotero-CiteFlow/
├── bootstrap.js                       # Zotero add-on lifecycle entry (legacy disable, chrome registration, bundle load)
├── prefs.js                           # Default values for all 10 native preferences
├── manifest.json / update.json        # Add-on metadata, Zotero 10–12.* scope & SHA-512 update feed
├── src/
│   ├── index.ts / hooks.ts / addon.ts / runtime.ts   # Startup hooks, concurrency gate & safe host patch registry
│   ├── preferences.ts                                # Settings pane controller (compile-time __buildVersion__/__buildDate__)
│   └── modules/
│       ├── cite.ts                    # Protected native Word Integration citation injector (locked SHA-256 baseline)
│       ├── drop-target.ts             # Win32 cursor window/process detector & lightweight foreground title probe
│       ├── citation/                  # 10 domain modules + typed contracts + session-sync-helpers.ts / refresh-helpers.ts
│       └── views/                     # 5 view domain modules (column manager, icon patch/order, drag-cite, window prep)
├── chrome/content/                    # Fluent-only 5-card 40px alignment preferences UI & bundled runtime scripts
├── locale/{zh-CN,en-US}/              # 42 strictly symmetric Fluent localization keys
├── csl/compact-journal-reference.csl  # Bundled compact CSL 1.0.2 reference style
├── scripts/                           # architecture-guard.mjs, build-source.mjs, build.ps1, test-settings-native.ps1, release-tags.py
└── tests/                             # 87 automated tests covering stability, data integrity, Word integration & guardrails
```

### Development & Release Commands (PowerShell + Node >= 22.14)

```powershell
# 1. Install pinned dev dependencies
npm ci

# 2. Typecheck & 13-point architecture guard (360-line cap, FTL symmetry, API bans, version/hash parity)
npm run typecheck
npm run guard

# 3. Bundle & execute full 87-test suite (Node native TypeScript stripping)
npm test

# 4. Build deterministic production XPI and sync SHA-512 update manifests
npm run package

# 5. Run isolated native Zotero desktop settings acceptance (requires local Zotero install)
pwsh -NoProfile -File scripts/test-settings-native.ps1 -XpiPath dist\zotero-citeflow-16.2.0.xpi -Locale en-US

# 6. Validate SemVer release-tag policy
python scripts/release-tags.py --self-test
```

### Technical Documentation Index

- [Technical maintenance guide (中文)](CORE-TECHNICAL-MAINTENANCE.md)
- [Release notes](RELEASE_NOTES.md) · [v16.2.0](docs/releases/v16.2.0.md) · [v16.1.0](docs/releases/v16.1.0.md) · [v16.0.0](docs/releases/v16.0.0.md)
- Earlier milestones: [v13.0.9](docs/releases/v13.0.9.md) · [v13.0.8](docs/releases/v13.0.8.md) · [v13.0.7](docs/releases/v13.0.7.md)
- [Brand guide](docs/brand/BRAND.md) · [README template](docs/brand/README-TEMPLATE.md) · [Product profile](docs/brand/PRODUCT.md) · [Improvement priorities](docs/brand/IMPROVEMENTS.md)
- Previous detailed guides (historical snapshots): [English](docs/reference/README.md) · [简体中文](docs/reference/README.zh-CN.md)
- [Third-party notices](THIRD_PARTY.md) · [Release/tag policy](docs/release-tag-policy.md)

---

<a id="series"></a>

## 🔗 The Flow Series

Each add-on installs and updates independently; sharing the series name does not imply a shared database or automatic cross-plugin execution:

| Product | Role |
|---|---|
| [Zotero RefFlow](https://github.com/groele/Zotero-RefFlow) | **Literature discovery** · Retrieve references, citations and related studies. |
| [Zotero MetaFlow](https://github.com/groele/Zotero-MetaFlow) | **Metadata organization** · Verify, normalize and enrich item metadata. |
| [Zotero ViewFlow](https://github.com/groele/Zotero-ViewFlow) | **Reading preview** · Preview and copy formatted citations directly in the sidebar. |
| [Zotero MindFlow](https://github.com/groele/Zotero-MindFlow) | **Knowledge mapping** · Turn items, annotations and notes into editable mind maps. |
| [Zotero TaskFlow](https://github.com/groele/Zotero-TaskFlow) | **Reading task tracker** · Transform literature into actionable reading tasks. |
| [Zotero CiteFlow](https://github.com/groele/Zotero-CiteFlow) | **Citation tracking** · Track Word citations and connect them to Zotero items. |
| [Zotero PaperFlow](https://github.com/groele/Zotero-PaperFlow) | **Publication flow** · Track manuscripts, submission rounds and referee responses. |

---

<a id="license"></a>

## 📄 Origin and License

- **Secondary Development Notice**: Zotero CiteFlow is independently developed and maintained based on MuiseDestiny’s (Polygon) open-source add-on [zotero-citation](https://github.com/MuiseDestiny/zotero-citation). Upstream copyright, `AGPL-3.0-only` obligations, and [third-party notices](THIRD_PARTY.md) remain in full effect; this project is neither an upstream distribution nor an official Zotero release.
- **License**: [AGPL-3.0-only](LICENSE).
- Zotero, Microsoft Word, and third-party names, logos, and trademarks belong to their respective owners.
