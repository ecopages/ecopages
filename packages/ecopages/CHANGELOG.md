# Changelog

All notable changes to `ecopages` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Reserved `--runtime node-experimental` for the future bundler-backed Node thin host and fail fast with an explicit not-yet-implemented message instead of silently changing the stable Node path.
- Routed `--runtime node-experimental` through a dedicated thin launcher and serialized runtime manifest handoff so the experimental boundary exists before the bundler-backed adapter work lands.

### Bug Fixes

- Removed the stable Node CLI dependency on `tsx` by routing both `node` and `node-experimental` through the framework-owned thin host and manifest handoff path.
- Renamed the shared thin-host handoff artifacts to neutral Node runtime manifest names so the stable `node` path no longer emits `node-experimental-*` filenames for the same runtime flow.
- Removed stale experimental-only launch-plan helper exports and a dead execution-strategy check so the CLI internals now match the unified thin-host runtime path more closely.
- Unified the internal Node launch execution-strategy label and startup warning around the shared thin-host path, so `node-experimental` no longer looks like a separate launcher implementation when it is only an alias.
- Disposed experimental thin-host runtime sessions when adapter bootstrap fails after startup, so `node-experimental` no longer leaks partially initialized sessions on config or app-entry load errors.
- Preserved `import.meta.dirname` and `import.meta.filename` semantics when bundling the experimental manifest writer, so `node-experimental` can now prepare manifests for apps whose `eco.config.ts` relies on those ESM path helpers.
- Kept the experimental thin host alive after successful startup and delegated shutdown cleanup to the runtime session, so node-experimental no longer exits immediately after a real app bootstrap.
- Moved the experimental manifest-writer bundle into the app `.eco/runtime/` directory so runtime prep artifacts stay inside the existing app-owned cache boundary.
- Switched the experimental Node thin-host handoff from launcher-built JSON to a core-owned manifest file under `.eco/runtime/`, generated through a bundled JS prep artifact instead of launch-time TypeScript execution.
