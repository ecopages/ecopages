# Changelog

## 0.2.0

### Minor Changes

- [`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee) Thanks [@andeeplus](https://github.com/andeeplus)! - The CLI launches on Bun when you invoke it with Bun, and on Node otherwise. Runtime selection follows `--runtime`, the package manager, and Bun availability. Use `--entry-file` rather than a positional entry path. `ecopages build` and `preview` run the source entry; `start` runs built output. `--config`, `--base-url`, and `--hostname` flow through the launch plan. Official templates are fetched from git tag `v${version}`.

### Patch Changes

- Updated dependencies [[`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee)]:
    - @ecopages/core@0.2.0

All notable changes to `ecopages` are documented here.

> Changelog tracking begins at version `0.2.0`. Prerelease history lives in git tags and GitHub Releases.
