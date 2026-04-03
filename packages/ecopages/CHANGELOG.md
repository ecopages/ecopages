# Changelog

All notable changes to `ecopages` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features & Improvements

- Added `ecopages-loader-hooks.cjs` using Node.js `module.registerHooks()` and esbuild `transformSync` to transparently transpile TypeScript at runtime, replacing the complex bootstrap build pipeline.
- Updated `launch-plan.js` to register loader hooks via `--require` before the thin-host entry point.

### Bug Fixes

- Fixed npm release packaging so the CLI publishes its built manifest instead of source `workspace:*` dependency ranges.

### Features & Improvements

- **Unified Node Startup**: Migrated all Node-based commands to the shared thin-host launcher, removing the direct `tsx` dependency and aligning production/dev behavior.
- **Improved Preview/Export**: Aligned the CLI `preview` command to rebuild the project and serve from `dist/` for accurate production parity.
- **Experimental Node Support**: Reserved and routed `--runtime node-experimental` through dedicated core-owned bootstrap and manifest-handoff flows.
