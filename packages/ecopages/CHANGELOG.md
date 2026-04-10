# Changelog

All notable changes to `ecopages` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Localized the Node CLI `tsx` runtime dependency so `ecopages` no longer requires a globally installed `tsx` binary.

### Refactoring

- Removed the CLI thin-host Node bootstrap path and its loader-hook runtime dependency so `ecopages` now defaults to Bun launches.
