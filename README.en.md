# Zotero CiteFlow

**Zotero Flow Series · Citation**

*让研究的每一步衔接起来。 / Connect each step of research.*

Track Word citations and connect them to Zotero items.

[简体中文](README.md) · [English](README.en.md)

[![Release](https://img.shields.io/badge/version-16.0.0-245ac7?style=flat-square)](https://github.com/groele/Zotero-CiteFlow/releases/tag/v16.0.0) · [Download XPI](https://github.com/groele/Zotero-CiteFlow/releases/download/v16.0.0/zotero-citeflow-16.0.0.xpi) · [Report an issue](https://github.com/groele/Zotero-CiteFlow/issues)

[Overview](#overview) · [Installation and updates](#installation) · [Quick start](#quick-start) · [Key features](#features) · [CSL Style Reference Case](#csl-example) · [Settings](#settings) · [Data, sync, and services](#data) · [Compatibility and validation](#compatibility) · [Troubleshooting](#troubleshooting) · [Development and documentation](#development) · [The Flow series](#series) · [Origin and license](#license)

<a id="overview"></a>

## Overview

For writers using Zotero and Microsoft Word: inspect citation status in the item list, maintain managed citation tags, and drag citations to an explicit target.

Install this add-on independently and combine it with other Flow products as needed.

<a id="installation"></a>

## Installation and updates

1. Download [zotero-citeflow-16.0.0.xpi](https://github.com/groele/Zotero-CiteFlow/releases/download/v16.0.0/zotero-citeflow-16.0.0.xpi) (add-on version **16.0.0**), not the Source code ZIP.
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

| Differentiator | What it does | Boundary |
|---|---|---|
| Word citation status | Surfaces recognized Word citation information in Zotero’s item list, so writers can review whether an item has entered a document. | An unrecognized result is not a claim that an item has never been cited. |
| Editable citation drag-and-drop | Routes a dragged item to Microsoft Word through Zotero integration, producing an editable Zotero citation field rather than plain text. | Applies only to an explicit Word target; it never rewrites existing Word fields or promises insertion into other applications. |
| Controlled citation tags & read-only guard | Marks citation relationships with add-on-owned tags; tag text and automatic tagging are configurable while manual tags are retained. Strictly adheres to `item.isEditable()` guards to prevent dirty writes in read-only group libraries or trash. | Disable/rename actions touch only tags the add-on can establish as its own; read-only items retain ownership records without illegal writes. |
| Layered Architecture & Function Governance | Thoroughly cleans up monolithic code into 11 strict architectural domain sections, eliminates dead code, and maximizes maintainability and stability. | Strictly defined boundaries with complete forward compatibility. |
| Three-level 40px golden baseline settings panel | Adheres to Zotero Flow 2026-11-02 design standards: 16px container padding, Level-2 labels and Level-3 subordinate elements strictly aligned at the 40px vertical line, 100% Fluent localized and keyboard accessible. | Built with modern Gecko box models; seamlessly adapts to Dark, Light, and High-Contrast system themes. |
| Inspectable settings and diagnostics | Exposes sync delay, refresh delay, performance thresholds, and debug logging with self-healing health check monitors. | Diagnostics aid observation; they do not replace Word or Zotero’s native troubleshooting. |


<a id="csl-example"></a>

## CSL Style Reference Case: Compact Journal Reference

To meet strict page limit requirements for top-tier journals and conference submissions (e.g., IEEE Transactions, ACM conferences, Nature sub-journals, CVPR, ICCV), CiteFlow bundles and recommends the customized ultra-compact citation style authored by **Shikunhou**:

📁 **Style File**: [`csl/compact-journal-reference.csl`](csl/compact-journal-reference.csl)

### 🌟 Core Style Features and Design Specifications

| Dimension | Standard Format (e.g., APA / Full IEEE) | Compact Journal Reference Style |
|---|---|---|
| **In-text Citation** | Author-year `(Vaswani et al., 2017)` or loose brackets | Compact numeric `[1]`, `[1, 2]`, `[1-4]` (auto-collapsed) |
| **Journal Title** | Full length (often wrapping to 2 lines) | Standard short italic (`form="short"`, e.g., *NeurIPS,*, *IEEE Trans. PAMI,*) |
| **Publication Year** | Enclosed in parentheses `(2017)` | **Bold font** (e.g., **2017**) for rapid visual scanning |
| **Volume & Pages** | Redundant prefixes `Vol. 30, no. 2, pp. 5998-6008` | Condensed syntax `30(2), 5998-6008` without boilerplate tokens |
| **Entry Spacing** | Loose line spacing | Flush alignment (`second-field-align="flush"`), zero entry spacing |

### 📊 Rendering Comparison

- **Traditional Format (Takes 3-4 lines)**:
  > `[1] Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, Ł., & Polosukhin, I. (2017). Attention is all you need. In Advances in Neural Information Processing Systems (Vol. 30, pp. 5998–6008). Currans Associates, Inc.`
- **Compact Journal Reference (Condensed into a single line, saving >60% vertical space)**:
  > `[1] Attention Is All You Need. NeurIPS, 2017, 30, 5998-6008.`

### 🚀 How to Install and Use in Word / WPS

1. **Obtain the CSL File**: Download [`csl/compact-journal-reference.csl`](csl/compact-journal-reference.csl) from this repository.
2. **Import into Zotero**:
   - In Zotero, navigate to **Edit → Settings / Preferences → Cite → Styles** (on macOS: **Zotero → Settings**).
   - Click the **"+" button** below the style list and select `compact-journal-reference.csl` (or drag and drop the file directly into Zotero).
3. **Activate in Word / WPS**:
   - In Word or WPS, click **Zotero → Document Preferences**.
   - Select **Compact Journal Reference** from the list and confirm.
   - Combined with CiteFlow's real-time citation tracking and drag-and-drop citation workflow, bibliography formatting becomes ultra-dense, elegant, and conference-ready!

<a id="settings"></a>

## Settings

Open the add-on preference page in **Zotero → Settings → Zotero CiteFlow**.

Restart Zotero after changing citation tracking. Configure dragging, tag text, and delays separately. Restore Defaults resets only the add-on’s nine settings.

<a id="data"></a>

## Data, sync, and services

- Citation status depends on Zotero/Word session identification; it is not an arbitrary document full-text scan independent of Word.
- Automatic tags write Zotero item tags. Read-only items (group libraries or trash) are safely protected with audit trails. Dropping into another application does not insert a citation in Word.

<a id="compatibility"></a>

## Compatibility and validation

| Item | Scope |
|---|---|
| Current add-on version | 16.0.0 |
| Declared Zotero range | `10.0` through `12.*` |
| Evidence boundary | 16.0.0 fully achieved §5.9 360-line ceiling across all 34 TypeScript modules (0 debt declared), established 13-point architecture-guard compliance suite, refactored settings into 5 lifecycle cards aligned with 14px / 40px grid standards, and introduced interlocking collection toggle. |

Add-on and Zotero versions are separate. Declared compatibility does not establish testing on every host, operating system or service. This patch validates the targeted behaviors listed above, not all plugin workflows or main-profile installation.

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
- [版本说明 / Release notes](RELEASE_NOTES.md)
- [v16.0.0 阶段说明 / Milestone notes](docs/releases/v16.0.0.md)
- [v13.0.9 阶段说明 / Milestone notes](docs/releases/v13.0.9.md)
- [v13.0.8 阶段说明 / Milestone notes](docs/releases/v13.0.8.md)
- [v13.0.7 阶段说明 / Milestone notes](docs/releases/v13.0.7.md)
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
| [Zotero RefFlow](https://github.com/groele/Zotero-RefFlow) | Literature discovery · Retrieve references, citations and related studies. |
| [Zotero MetaFlow](https://github.com/groele/Zotero-MetaFlow) | Metadata organization · Verify, normalize and enrich item metadata. |
| [Zotero ViewFlow](https://github.com/groele/Zotero-ViewFlow) | Reading preview · Preview and copy formatted citations directly in the sidebar. |
| [Zotero MindFlow](https://github.com/groele/Zotero-MindFlow) | Knowledge mapping · Turn items, annotations and notes into editable mind maps. |
| [Zotero TaskFlow](https://github.com/groele/Zotero-TaskFlow) | Reading task tracker · Transform literature into actionable reading tasks. |
| [Zotero CiteFlow](https://github.com/groele/Zotero-CiteFlow) | Citation tracking · Track Word citations and connect them to Zotero items. |
| [Zotero PaperFlow](https://github.com/groele/Zotero-PaperFlow) | Publication flow · Track manuscripts, submission rounds and referee responses. |

Install and update each add-on separately; belonging to the same series does not imply a shared database or automatic cross-connection of every flow.

<a id="license"></a>

## Origin and license

**Secondary development notice:** Zotero CiteFlow is independently developed and maintained based on MuiseDestiny's (Polygon) open-source add-on [zotero-citation](https://github.com/MuiseDestiny/zotero-citation). Upstream copyright, AGPL obligations and applicable third-party notices remain effective; this project is not an upstream or official Zotero release.

License: [AGPL-3.0-only](LICENSE).

This series is independently maintained and is not an official Zotero product. Zotero and third-party names, logos and materials belong to their respective owners.

[Release/tag policy](docs/release-tag-policy.md)
