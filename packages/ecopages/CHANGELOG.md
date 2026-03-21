# Changelog

All notable changes to `ecopages` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Reserved `--runtime node-experimental` for the future bundler-backed Node thin host and fail fast with an explicit unsupported message until that path is implemented.

### Refactoring

- Unified the Node CLI thin-host launch path around framework-owned runtime manifests and neutral runtime manifest naming.

### Bug Fixes

- Removed the CLI's direct `tsx` binary dependency by routing Node startup through the thin host and bundled manifest preparation flow.
- Moved Node runtime prep artifacts into `.eco/runtime/`, preserved `import.meta.dirname` and `import.meta.filename` during manifest preparation, and kept successful thin-host sessions alive after startup.
- Disposed failed runtime sessions and removed stale experimental-only launch-plan handling so Node startup and shutdown behavior stay aligned with the shared thin-host path.
- Switched the default thin-host runtime manifest preparation path to `.eco/runtime` and aligned preview with a build-then-serve `dist` flow.
