> 原详细指南，保存于 2026-10-21。历史版本与验证范围按原记录理解；当前安装入口见 [README](../../README.md)。

<div align="center">

# Zotero CiteFlow

**Track citations across Zotero and Microsoft Word.**

[English](../../README.md) · [简体中文](../../README.zh-CN.md)

![Version](https://img.shields.io/badge/version-12.3.3-blue) ![Zotero](https://img.shields.io/badge/Zotero-8.0%E2%80%9311.0.*-green) ![License](https://img.shields.io/badge/license-AGPL-3.0-only-lightgrey)

[Download](https://github.com/groele/Zotero-CiteFlow/releases/tag/v12.3.3) · [12.3.3 Release Notes](../../RELEASE_NOTES.md) · [Report an Issue](https://github.com/groele/Zotero-CiteFlow/issues) · [Releases](https://github.com/groele/Zotero-CiteFlow/releases)

**Zotero Flow Series**

</div>

---

## Overview

Zotero CiteFlow is an independently maintained Zotero add-on that track citations across Zotero and Microsoft Word. It is designed for research workflows that need practical functionality within the Zotero desktop application.

## Key Features

- Identify references cited in Word documents from Zotero.
- Display citation status and information within the Zotero item list.
- Work with Zotero's native Word integration without rewriting citation fields.
- Maintain reference-related views and actions within a familiar Zotero workflow.

## Screenshots

See the [core technical and maintenance guide](../../CORE-TECHNICAL-MAINTENANCE.md) for implementation details, validation status, and known risks.

## Compatibility

| Item | Details |
| --- | --- |
| Add-on version | `12.3.3` |
| Package author | `Zotero CiteFlow` |
| Add-on ID | `citeflow@groele` |
| Declared Zotero range | `8.0–11.0.*` |
| Verification | Zotero 10.0.6 and Microsoft Word 16.0.20430 on Windows; Zotero 8/9/11 desktop validation is incomplete. |

The declared compatibility range is not a guarantee that every Zotero version has been tested.

## Installation

1. [Download the XPI](https://github.com/groele/Zotero-CiteFlow/releases/tag/v12.3.3) for the current release (`zotero-citeflow-12.3.3.xpi`).
2. Open Zotero → **Tools → Plugins** (or the add-on manager in your version).
3. Choose **Install Add-on From File**, select the XPI, and restart Zotero if requested.

Update feed: [update.json](https://github.com/groele/Zotero-CiteFlow/blob/main/update.json).

## Quick Start

1. Install the XPI from the linked Release using Zotero's add-on manager.
2. Open a Word document containing Zotero citations and use Zotero's Word integration.
3. Inspect citation details and status in Zotero's item list.

## Configuration & Notes

Open **Edit → Settings → Zotero CiteFlow** on Windows. The pane remains available when citation tracking is disabled.

| Setting | Default | When it takes effect |
| --- | --- | --- |
| Citation tracking | On | After restarting Zotero |
| Drag citation | On | Immediately; works with the citation column hidden |
| Automatic citation tags | On | Immediately; turning it off removes plugin-managed tags |
| Citation tag text | `/Citations` | Immediately; renames plugin-managed tags |
| Citation-tag sync delay | 150 ms | Subsequent tag sync tasks |
| Item-list refresh delay | 120 ms | Subsequent refresh tasks |
| Diagnostic time window | 300000 ms | Subsequent diagnostic queries |
| Slow-operation threshold | 50 ms | Subsequent performance measurements |
| Debug logging | Off | Immediately |

Values save automatically. The tag text accepts 1–200 characters, including Chinese text. Numeric fields enforce their displayed integer ranges. **Restore defaults** resets these nine settings only. Existing manual tags and unrelated Zotero preferences are preserved. Tag renaming saves the removal and addition together; failed writes retain the previous tag and ownership for retry. Save/application failures are reported in the pane.

See the [core technical and maintenance guide](../../CORE-TECHNICAL-MAINTENANCE.md) for verification evidence and remaining Word integration limits. Dragging into Word inserts an editable Zotero citation field; dropping into another application does not insert into Word. The apostrophe shortcut was retired because its implicit insertion target and Word caret position were easy to confuse.

## Development & Testing

Run the following commands from the repository root. Follow project-specific test prerequisites before running native desktop validation.

```powershell
npm ci
npm test
npm run package
```

These commands describe available project tasks, not a claim that every environment or integration test passes.

## Documentation & Support

[Core technical and maintenance guide](../../CORE-TECHNICAL-MAINTENANCE.md) · [Third-party notices](../../THIRD_PARTY.md)

[Open an issue](https://github.com/groele/Zotero-CiteFlow/issues) · [Browse source](https://github.com/groele/Zotero-CiteFlow)

## Acknowledgements & Attribution

Zotero CiteFlow was originally developed as a derivative of [MuiseDestiny/zotero-citation](https://github.com/MuiseDestiny/zotero-citation) by MuiseDestiny (Polygon). We acknowledge the original author and contributors for their foundational work. This Zotero Flow Series edition is independently maintained, is not an official release of the upstream project, and is not endorsed by Zotero. Original copyright and applicable third-party notices remain in force.

## License

Distributed under **AGPL-3.0-only**. See [LICENSE](../../LICENSE) and any applicable third-party notices for details.

Zotero and associated trademarks belong to their respective owners.
