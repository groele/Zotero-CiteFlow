# Release and tag policy

Applies to Zotero CiteFlow. Established: 2026-10-22.

## Version and tag identity

- Stable tags use exactly `vMAJOR.MINOR.PATCH`, for example `v12.6.0`. Use a lowercase `v`, three decimal components, and no leading zeroes, project prefixes, spaces or build metadata.
- Prereleases use `vMAJOR.MINOR.PATCH-alpha.N`, `-beta.N` or `-rc.N`, where N is a positive integer. Mark their GitHub Releases as prereleases.
- Package and manifest version fields omit the `v`. Their version must match the release tag. Preserve each plugin's independent version history.
- Use a new minor version for backward-compatible functionality, a patch for fixes, and a major version for incompatible data/configuration changes.
- Release titles use `Zotero CiteFlow MAJOR.MINOR.PATCH` (including the suffix for a prerelease).

## Immutable releases

- New release tags are annotated and point to the exact reviewed, tested release commit. Never move or overwrite a published canonical tag; make a new release for corrections.
- Preserve historical canonical tags and their commit identity. Old lightweight canonical tags are grandfathered; newly created tags must be annotated.
- A Release is published only after the matching XPI is built and checked. Include the exact installer checksum, verification results and known limitations. The automatic update feed must use the immutable release asset URL and matching checksum.
- Keep old asset filenames and bytes when normalizing historical release metadata. Historical predecessor versions keep their original numeric version; select the maintained stable release explicitly as Latest.

## Historical normalization

- `docs/release-tag-migrations.json` records each old name, canonical replacement and unchanged commit, or archival of an unversioned non-release label. No historical version or commit is invented.
- Short forms such as `V10` become `v10.0.0`; uppercase and project-prefixed forms become lowercase canonical SemVer tags. Verify conflicts before mutation.
- Preserve Release IDs and asset IDs when moving a Release to its canonical tag. Old tag-based URLs may change; use the recorded mapping and corrected current documentation links.
- Original tag objects and release metadata are backed up before cleanup. Do not repeat historical migration during normal release creation.

## Commands and automated checks

Run `python scripts/release-tags.py --self-test` before release preparation. After committing a clean release payload, run `python scripts/release-tags.py --create-tag vX.Y.Z`; it creates only a local tag. Verify it with `python scripts/release-tags.py --tag vX.Y.Z` before the authorized push and GitHub Release publication.

The tag-policy workflow validates new pushed tag syntax, version agreement, annotation and commit identity. It also validates policy changes on pull requests. A failed workflow signals a violation; it is not a server-side prohibition on creating Git references.
