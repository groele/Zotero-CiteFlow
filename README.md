# Zotero CiteFlow

Zotero CiteFlow tracks citations between Zotero and Word and displays citation details in Zotero's item list.

| Field | Value |
| --- | --- |
| Add-on name | Zotero CiteFlow |
| Add-on ID | `citeflow@groele` |
| Current development version | `40.1.0` |
| Repository | [groele/Zotero-CiteFlow](https://github.com/groele/Zotero-CiteFlow) |
| Update feed | [update.json](https://raw.githubusercontent.com/groele/Zotero-CiteFlow/main/update.json) |
| Declared Zotero range | `8.0`–`11.0.*` |

## Upgrade from Easier Citation

The add-on ID changed from `zoterocitation@polygon.org` to `citeflow@groele`, so Zotero treats CiteFlow as a separate add-on. Install the CiteFlow XPI once from the repository's Releases page. On first startup, CiteFlow asks Zotero to disable the legacy add-on before loading its own code, preventing duplicate Word listeners and column registrations. Existing `extensions.zotero.zoterocitation.*` preferences are retained. After confirming CiteFlow works in your Word documents, remove the disabled Easier Citation entry from Zotero's Add-ons pane.

## Compatibility and validation

The manifest and update feed declare Zotero `8.0` through `11.0.*`. This is a compatibility range declaration, not proof that every version in the range has passed desktop testing. The available native validation used Zotero 10.0.6 and Microsoft Word 16.0.20430; Zotero 8, 9, and 11 have not been tested in this project. The CiteFlow quick-insert path also remains under investigation; see `VALIDATION-40.1.0.md` before installing this candidate in a primary profile.

Citation fields and Word document metadata are managed by Zotero's native integration. This plugin preserves those native field/index structures and does not rewrite the document's citation payload format.

## Build and tests

Requirements: PowerShell 7 and Node.js 22 or later.

```powershell
npm ci
npm test
./scripts/build.ps1 -OutputDirectory dist/my-build
```

The build is sourced from `src/` and pins esbuild in `package-lock.json`. The XPI contains only runtime files; test drivers and build outputs are excluded. The packaging script checks the archive contents and writes an update-feed candidate with the XPI hash.

## Source and license

This project is derived from [MuiseDestiny/zotero-citation](https://github.com/MuiseDestiny/zotero-citation). Original copyright, source attribution, and AGPL-3.0 obligations remain in force. Third-party runtime and build-tool provenance is listed in `THIRD_PARTY.md`.
