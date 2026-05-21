# Changelog

All notable changes to `ecopages` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Bug Fixes

- Replaced the Node runtime `tsx` app-entry launch path with an Ecopages-owned ESM bridge under `.eco/` so Node launches preserve top-level await, app-local package resolution, environment forwarding, and `import.meta` runtime values.
- Loaded standard `.env` files for Node runtime launches so `ecopages ... --runtime node` sees app-local environment values.
- Restored shared server/build option parsing for `ecopages build` so documented flags like `--base-url` and `--hostname` still flow through to the launch environment.

### Refactoring

- Simplified CLI runtime startup and removed the thin-host bootstrap path; runtime selection now follows explicit `--runtime` overrides, package-manager hints, and Bun availability.
- Replaced the `ecopages` bin command parser with Node's built-in `parseArgs`, normalized CLI option names onto the launch-plan contract, and removed the dead direct-runtime execution-strategy wrapper from the launch plan.
