# Changelog

All notable changes to `ecopages` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Breaking Changes

- Positional entry-file arguments are rejected in favor of `--entry-file`.

### Features

- Simplified CLI runtime startup: runtime selection follows explicit `--runtime` overrides, package-manager hints, and Bun availability.
- Replaced the `ecopages` bin command parser with Node's built-in `parseArgs` and normalized CLI option names onto the launch-plan contract.
- Added GitHub sign-in to the react-better-auth template via Better Auth social providers.

### Bug Fixes

- Restored `ecopages build` and `preview` source-entry execution; `start` runs built output.
- Restored app-level `require(...)` support and standard `.env` loading for Node runtime launches.
- Restored shared server/build option parsing so documented flags like `--base-url` and `--hostname` flow through to the launch environment.
- Switched the react-better-auth template from `bun:sqlite` to libSQL so `pnpm dev` runs on Node.
