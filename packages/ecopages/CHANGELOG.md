# Changelog

## 0.2.0-rc.10

### Minor Changes

- [#319](https://github.com/ecopages/ecopages/pull/319) [`22fd810`](https://github.com/ecopages/ecopages/commit/22fd8105d0b0a3a1de25962ea22d758440edbbb1) Thanks [@andeeplus](https://github.com/andeeplus)! - Add Vite-shaped `defineConfig` and async config loading from `eco.config.ts`. `createApp()` and `ecopages()` load the config when omitted; the CLI accepts `--config`, and production server bundles emit and load `dist/.server/eco.config.mjs`. Author-facing config is `EcoPagesUserConfig` only.

- [#319](https://github.com/ecopages/ecopages/pull/319) [`a176633`](https://github.com/ecopages/ecopages/commit/a176633eb8ae84da9a64cf9d7d8ad210fda371e5) Thanks [@andeeplus](https://github.com/andeeplus)! - Dev servers use `PortManager` for port collisions, with a Clack confirmation on TTY sessions and safe default-port fallback in non-interactive environments. Adding, changing, or removing `eco.config` and supported `.env` files restarts the supervised `ecopages dev` process and reloads dotenv values.

### Patch Changes

- Updated dependencies [[`22fd810`](https://github.com/ecopages/ecopages/commit/22fd8105d0b0a3a1de25962ea22d758440edbbb1), [`a176633`](https://github.com/ecopages/ecopages/commit/a176633eb8ae84da9a64cf9d7d8ad210fda371e5), [`f669755`](https://github.com/ecopages/ecopages/commit/f669755186973edd702c78d8d9e0e726f982b3a8), [`c3c2331`](https://github.com/ecopages/ecopages/commit/c3c2331ee88fb9b383a384e3d35568876c1d9fd3)]:
    - @ecopages/core@0.2.0-rc.10

## 0.2.0-rc.9

### Patch Changes

- Updated dependencies [[`5a58517`](https://github.com/ecopages/ecopages/commit/5a58517de1f896240bb54858e12af9b872a76bb2)]:
    - @ecopages/core@0.2.0-rc.9

## 0.2.0-rc.8

### Patch Changes

- Updated dependencies [[`e31f76b`](https://github.com/ecopages/ecopages/commit/e31f76b552abdd349c3ae7d94ffe20bb4384456a)]:
    - @ecopages/core@0.2.0-rc.8

## 0.2.0-rc.7

### Patch Changes

- Updated dependencies [[`2fa58cb`](https://github.com/ecopages/ecopages/commit/2fa58cb2e12115aa26e2a4bf3d8ea9132f029657), [`f167916`](https://github.com/ecopages/ecopages/commit/f167916f5159e4ecf421db3d8b199089d6bf6171)]:
    - @ecopages/core@0.2.0-rc.7

## 0.2.0-rc.6

### Patch Changes

- Updated dependencies [[`e1ba6d9`](https://github.com/ecopages/ecopages/commit/e1ba6d9f00323a618c61dbc6e1ca46da24cdf134)]:
    - @ecopages/core@0.2.0-rc.6

## 0.2.0-rc.5

### Patch Changes

- Updated dependencies [[`033ac3d`](https://github.com/ecopages/ecopages/commit/033ac3d35b89136d390fa167313ce234bf864d5d)]:
    - @ecopages/core@0.2.0-rc.5

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
