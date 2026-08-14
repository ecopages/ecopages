# npm is the only release channel

- Status: Accepted
- Date: 2026-08-14

## Context

Ecopages was dual-published to npm and JSR. The `ecopages` CLI is the install entrypoint: it owns command discovery, runtime selection, and the `bin` that `npx` / `pnpm exec` run. JSR still has no package-bin / `npx`-like execution ([jsr-io/jsr#157](https://github.com/jsr-io/jsr/issues/157)), so the CLI cannot live there.

Library packages on JSR without that CLI are a second registry with no reason to install from it. Historical JSR versions stop at `0.1.105`. npm already publishes `0.2.0-rc.0`, including the CLI.

## Decision

Publish only to npm. Leave existing JSR `0.1.105` packages on the registry; do not yank them.

`@ecopages/ecopages-jsx` moves onto npm with the other public packages. Version bumps sync every non-private `packages/**/package.json` from the workspace root version.

## Consequences

- The publish workflow has a single npm job.
- `jsr.json`, `release:jsr`, and JSR version-sync scripts are gone.
- Consumers install with npm/pnpm/bun from the npm registry, typically through the `ecopages` CLI.
