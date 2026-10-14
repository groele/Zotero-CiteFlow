<div align="center">

# Zotero CiteFlow

**Track citations across Zotero and Microsoft Word.**

[English](README.md) · [简体中文](README.zh-CN.md)

![Version](https://img.shields.io/badge/version-10.0.0-blue) ![Zotero](https://img.shields.io/badge/Zotero-8.0%E2%80%9311.0.*-green) ![License](https://img.shields.io/badge/license-AGPL-3.0-only-lightgrey)

[Download](https://github.com/groele/Zotero-CiteFlow/releases/tag/v10) · [Report an Issue](https://github.com/groele/Zotero-CiteFlow/issues) · [Releases](https://github.com/groele/Zotero-CiteFlow/releases)

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

For interface examples and implementation details, see the [project documentation](https://github.com/groele/Zotero-CiteFlow/tree/main/docs) where available. Screenshots will be added only after they are verified against the current interface.

## Compatibility

| Item | Details |
| --- | --- |
| Add-on version | `10.0.0` |
| Add-on ID | `citeflow@groele` |
| Declared Zotero range | `8.0–11.0.*` |
| Verification | Zotero 10.0.6 and Microsoft Word 16.0.20430 on Windows; Zotero 8/9/11 desktop validation is incomplete. |

The declared compatibility range is not a guarantee that every Zotero version has been tested.

## Installation

1. [Download the XPI](https://github.com/groele/Zotero-CiteFlow/releases/tag/v10) for the current release (`zotero-citeflow-10.0.0.xpi`).
2. Open Zotero → **Tools → Plugins** (or the add-on manager in your version).
3. Choose **Install Add-on From File**, select the XPI, and restart Zotero if requested.

Update feed: [update.json](https://github.com/groele/Zotero-CiteFlow/blob/main/update.json).

## Quick Start

1. Install the XPI from the linked Release using Zotero's add-on manager.
2. Open a Word document containing Zotero citations and use Zotero's Word integration.
3. Inspect citation details and status in Zotero's item list.

## Configuration & Notes

Microsoft Word with Zotero's Word integration is required. Quick-insert behavior is still under investigation; verify it with a test document before production use.

**Installation / coexistence note:** The add-on ID differs from the original Easier Citation plugin. Zotero treats them as separate add-ons; avoid running both simultaneously. The 10.0.0 version may be treated as a downgrade from previously installed 40.x builds.

## Development & Testing

Run the following commands from the repository root. Follow project-specific test prerequisites before running native desktop validation.

```powershell
npm ci
npm test
npm run package
``

These commands describe available project tasks, not a claim that every environment or integration test passes.

## Documentation & Support

[Validation notes](VALIDATION-40.1.0.md) · [Third-party notices](THIRD_PARTY.md)

[Open an issue](https://github.com/groele/Zotero-CiteFlow/issues) · [Browse source](https://github.com/groele/Zotero-CiteFlow)

## Acknowledgements & Attribution

Zotero CiteFlow was originally developed as a derivative of [MuiseDestiny/zotero-citation](https://github.com/MuiseDestiny/zotero-citation) by MuiseDestiny (Polygon). We acknowledge the original author and contributors for their foundational work. This Zotero Flow Series edition is independently maintained, is not an official release of the upstream project, and is not endorsed by Zotero. Original copyright and applicable third-party notices remain in force.

## License

Distributed under **AGPL-3.0-only**. See [LICENSE](LICENSE) and any applicable third-party notices for details.

Zotero and associated trademarks belong to their respective owners.
