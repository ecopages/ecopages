# Changelog

All notable changes to `ecopages` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Localized the Node CLI `tsx` runtime dependency so `ecopages` no longer requires a globally installed `tsx` binary.

### Refactoring

- Simplified CLI runtime startup and removed the thin-host bootstrap path; runtime selection now follows explicit `--runtime` overrides, package-manager hints, and Bun availability.
