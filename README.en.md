# Zotero CiteFlow

> Source metadata is 12.5.0. The latest downloadable XPI remains the previous release until a 12.5.0 package is published.

**Zotero Flow Series · Citation**

*让研究的每一步衔接起来。 / Connect each step of research.*

Track Word citations and connect them to Zotero items.

[简体中文](README.md) · [English](README.en.md)

[![Release](https://img.shields.io/badge/version-12.5.0-245ac7?style=flat-square)](https://github.com/groele/Zotero-CiteFlow/releases/tag/v12.5.0) · [Download XPI](https://github.com/groele/Zotero-CiteFlow/releases/download/v12.3.4/zotero-citeflow-12.3.4.xpi) · [Report an issue](https://github.com/groele/Zotero-CiteFlow/issues)

[Overview](#overview) · [Installation and updates](#installation) · [Quick start](#quick-start) · [Key features](#features) · [Settings](#settings) · [Data, sync, and services](#data) · [Compatibility and validation](#compatibility) · [Troubleshooting](#troubleshooting) · [Development and documentation](#development) · [The Flow series](#series) · [Origin and license](#license)

<a id="overview"></a>

## Overview

For writers using Zotero and Microsoft Word: inspect citation status in the item list, maintain managed citation tags, and drag citations to an explicit target.

Install this add-on independently and combine it with other Flow products as needed.

<a id="installation"></a>

## Installation and updates

1. Download [zotero-citeflow-12.3.4.xpi](https://github.com/groele/Zotero-CiteFlow/releases/download/v12.3.4/zotero-citeflow-12.3.4.xpi) (add-on version **12.3.4**), not the Source code ZIP.
2. In Zotero, open **Tools → Plugins/Add-ons**, then choose **Install Add-on From File** from the gear menu.
3. Select the XPI, complete installation, and restart if requested.

Use the add-on manager to check for later updates. Automatic checking/installation depends on Zotero, per-add-on update settings, and compatibility. Back up important data before upgrades or migration.

Update feed: [update.json](https://github.com/groele/Zotero-CiteFlow/blob/main/update.json) · Add-on ID: `citeflow@groele`.

<a id="quick-start"></a>

## Quick start

1. Open a Word document containing Zotero citations and use the native Word integration.
2. Return to Zotero and inspect the citation column, identified-document status, and tags.
3. When inserting, drag the item into the target Word document and inspect the insertion position.

<a id="features"></a>

## Key features

| Feature | Scope |
|---|---|
| Citation status | Display citation information for identified documents in the Zotero item list. |
| Editable citations | Insert editable citation fields through Zotero integration when dragging into Word. |
| Managed tags | Configure citation tag text and maintain plugin-owned tags while preserving unrelated manual tags. |
| Settings and diagnostics | Configure synchronization delay, list refresh, and diagnostic parameters. |

<a id="settings"></a>

## Settings

Open the add-on preference page in **Zotero → Settings → Zotero CiteFlow**.

Restart Zotero after changing citation tracking. Configure dragging, tag text, and delays separately. Restore Defaults resets only the add-on’s nine settings.

<a id="data"></a>

## Data, sync, and services

- Citation status depends on Zotero/Word session identification; it is not an arbitrary document full-text scan independent of Word.
- Automatic tags write Zotero item tags. Dropping into another application does not insert a citation in Word.

<a id="compatibility"></a>

## Compatibility and validation

| Item | Scope |
|---|---|
| Current add-on version | 12.5.0 |
| Declared Zotero range | `8.0` through `11.0.*` |
| Evidence boundary | The 12.3.4 settings pane was checked in Windows Zotero 10.0.6, including sequential navigation and MetaFlow card palette comparison and 34 build tests passed; live Word operations were not rerun, and these results do not establish macOS Word support. |

Add-on and Zotero versions are separate. Manifest compatibility does not establish testing on every host, operating system, or service. This branding/documentation update does not rerun business workflow tests.

<a id="troubleshooting"></a>

## Troubleshooting

For unexpected citation status, confirm document identity and Zotero Word integration. Report the Word version, document-switching sequence, and a minimal reproduction.

For an issue, include add-on/Zotero versions, OS, steps, expected/actual results, and sanitized errors.

<a id="development"></a>

## Development and documentation

Normal installation needs no development environment. Existing developer entry points follow; use an isolated profile for native tests.

```powershell
npm ci
npm test
npm run package
```

- [技术与维护指南 / Technical guide](CORE-TECHNICAL-MAINTENANCE.md)
- [第三方声明 / Third-party notices](THIRD_PARTY.md)
- [版本说明 / Release notes](RELEASE_NOTES_v12.3.4.md)
- [产品简介 / Product profile](docs/brand/PRODUCT.md)
- [品牌规范 / Brand guide](docs/brand/BRAND.md)
- [README 模板 / README template](docs/brand/README-TEMPLATE.md)
- [后续提升清单 / Improvement priorities](docs/brand/IMPROVEMENTS.md)
- [Previous detailed guide · README.md](docs/reference/README.md)
- [Previous detailed guide · README.zh-CN.md](docs/reference/README.zh-CN.md)

Previous detailed guides retain feature detail, shortcuts, historical evidence, and full attribution. Their versions and test results belong to the recorded stage.

<a id="series"></a>

## The Flow series

| Product | Role |
|---|---|
| [Zotero RefFlow](https://github.com/groele/Zotero-RefFlow) | Discovery · Discover references, citing works, and related research. |
| [Zotero MetaFlow](https://github.com/groele/Zotero-MetaFlow) | Metadata · Validate, normalize, and enrich reference metadata. |
| [Zotero ViewFlow](https://github.com/groele/Zotero-ViewFlow) | Preview · Preview and copy formatted references in Zotero’s item pane. |
| [Zotero MindFlow](https://github.com/groele/Zotero-MindFlow) | Knowledge · Organize papers, annotations, and ideas into editable maps. |
| [Zotero TaskFlow](https://github.com/groele/Zotero-TaskFlow) | Tasks · Turn literature reading into trackable tasks and plans. |
| [Zotero CiteFlow](https://github.com/groele/Zotero-CiteFlow) | Citation · Track Word citations and connect them to Zotero items. |
| [Zotero PaperFlow](https://github.com/groele/Zotero-PaperFlow) | Publication · Manage manuscripts, submission rounds, and review responses. |

Each add-on installs and updates separately. A shared brand does not imply a shared database or automatic integration of every workflow.

<a id="license"></a>

## Origin and license

Independently maintained derivative of MuiseDestiny (Polygon)’s zotero-citation; upstream copyright and third-party notices remain in force.

License: [AGPL-3.0-only](LICENSE).

This series is independently maintained and is not an official Zotero product. Zotero and third-party names, trademarks, and materials belong to their respective rights holders.
