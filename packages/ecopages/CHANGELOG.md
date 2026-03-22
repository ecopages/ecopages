# Changelog

All notable changes to `ecopages` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Reserved `--runtime node-experimental` for the future bundler-backed Node thin host and fail fast with an explicit unsupported message until that path is implemented.

### Refactoring

- Unified the Node CLI thin-host launch path around framework-owned runtime manifests and neutral runtime manifest naming.
- Removed obsolete Node manifest-writer bundling helpers from launch planning now that manifest creation is direct and side-effect free.

### Bug Fixes

- Simplified Node thin-host startup manifest preparation to avoid launch-time config execution side effects and keep runtime bootstrap as the single config-loading path.
- Removed the CLI's direct `tsx` binary dependency by routing Node startup through the thin host and framework-owned runtime manifest flow.
- Moved Node runtime prep artifacts into `.eco/runtime/` and kept successful thin-host sessions alive after startup.
- Disposed failed runtime sessions and removed stale experimental-only launch-plan handling so Node startup and shutdown behavior stay aligned with the shared thin-host path.
- Switched the default thin-host runtime manifest preparation path to `.eco/runtime` and aligned preview with a build-then-serve `dist` flow.
