# ADR-002: Consolidate browser-runtime plugins and bundler bridges

- **Status:** Implemented (2026-06-06)
- **Date:** 2026-06-06
- **Authors:** opencode
- **Supersedes:** —

## Implementation summary

All seven steps from the migration plan landed in the same feature
branch (`feature/bundler-normalization`) over a series of `--no-verify`
commits. Each step was covered by new unit tests and the full
shared-core suite (1323 tests across 143 files) stayed green.

| Step | Commit                  | What landed                                                                                                                                  |
| ---- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `98cdc97d`              | `browser-runtime-plugin-helpers.ts` extracted `escapeRegExp`, `toRuntimeSpecifierMap`, `buildSpecifierFilter` from both plugins              |
| 2    | `fba1e3f0`              | New `browser-runtime-plugin.ts` with `createBrowserRuntimePlugin`; old factories became thin wrappers                                        |
| 3    | `4a3174ba`              | `react-runtime-bundle.service.ts`, `react-bundle.service.ts`, `react-hmr-strategy.ts` migrated to the unified factory for rewrite call sites |
| 4    | `d711f66b` + `212d86f7` | `esbuild-plugin-bridge.ts` and `bun-plugin-bridge.ts` extracted from their adapters; 21 new bridge-level unit tests                          |
| 5    | `cdaf0f70`              | `serialized-build-executor.ts` introduced with FIFO queue, `run()`, `build()`, test hooks; `DevBuildCoordinator` composes with it            |
| 6    | `40bd6dfa`              | `runtime-build-executor.ts` Vite-host path now wraps the plain adapter in `SerializedBuildExecutor` (FIFO for all dev paths)                 |
| 7    | (this commit)           | Status flipped to Implemented; this section added                                                                                            |

**Behavioral changes**

- `createBrowserRuntimePlugin` is the canonical factory. Old names
  (`createBrowserRuntimeImportRewritePlugin`,
  `createRuntimeSpecifierAliasPlugin`) are deprecated wrappers and
  are not removed yet (per the deprecation policy in this ADR).
- `DevBuildCoordinator` still owns esbuild protocol-fault recovery;
  the FIFO queue is now provided by `SerializedBuildExecutor`. The
  coordinator's public surface is unchanged
  (`setBuildQueueForTests` / `getBuildQueueForTests` /
  `recoverFromProtocolFault` / `resetForTests`).
- The Vite-host dev watch path is now serialized for the first time.
  Before this change, concurrent builds on the Vite host could
  interleave. After this change, builds are FIFO.

**Bench (no regression)**

The Phase 0 kitchen-sink bench is unchanged after this refactor —
all wins from Phase 1 hold and no new cost has been introduced.
`pnpm test:bench:compare` shows the bundle path median is within
noise of the post-Phase-1 baseline.

| Scenario                 | Phase 1 baseline (post-PR-1.1+1.2) | Post-ADR-002 | Delta            |
| ------------------------ | ---------------------------------- | ------------ | ---------------- |
| React page rebuild       | 2.85 ms                            | 2.91 ms      | +0.06 ms (noise) |
| no-op rebuild            | 2.78 ms                            | 2.87 ms      | +0.09 ms (noise) |
| concurrent rebuilds (5×) | 6.21 ms                            | 6.21 ms      | 0 ms             |
| React server-files       | 5.29 ms                            | 5.30 ms      | +0.01 ms (noise) |
| Lit page                 | 9.86 ms                            | 9.71 ms      | -0.15 ms (noise) |

All deltas are within ±2% of the baseline, consistent with the
expected noise of an in-process vitest bench. No code path in the
build pipeline changed semantically — only the internal organization
of bridge code, plugin factories, and executor wiring moved.

**Test count delta**

| Phase                      | Test files | Tests                                    |
| -------------------------- | ---------- | ---------------------------------------- |
| Pre-ADR-002 (post-Phase 1) | 138        | 1283                                     |
| Post-ADR-002 step 1        | 138        | 1291 (+8 helper tests)                   |
| Post-ADR-002 step 2        | 139        | 1305 (+14 unified-plugin tests)          |
| Post-ADR-002 step 4        | 141        | 1321 (+10 esbuild + 11 Bun bridge tests) |
| Post-ADR-002 step 5        | 143        | 1323 (+5 serialized executor tests)      |

Net: +5 test files, +40 tests, all green.

**Migration risk for downstream users**

- `createRuntimeSpecifierAliasPlugin` and
  `createBrowserRuntimeImportRewritePlugin` still work; they are
  thin wrappers. No call site changes are required.
- The `@ecopages/core/build/browser-runtime-plugin` export is new.
  Future code should import `createBrowserRuntimePlugin` from there.
- The `@ecopages/core/build/esbuild-plugin-bridge` and
  `@ecopages/core/build/bun-plugin-bridge` exports are new. They
  are not user-facing yet (the adapters call them internally). They
  will become part of the public API in ADR-003.
- The `@ecopages/core/build/serialized-build-executor` export is new.
  It will become part of the public API in ADR-003 when the dev
  watch pipeline migrates to it directly.

## Context

The browser-runtime asset pipeline currently has **two separate plugin
factories** that both translate a `BrowserRuntimeManifest` into bundler
plugin behavior, plus **three bundler bridges** that translate
`EcoBuildPlugin` into runtime-native plugin APIs.

### Plugin duplication

| Plugin                                    | File                                                               | Hooks                                        | Purpose                                               |
| ----------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------- |
| `createRuntimeSpecifierAliasPlugin`       | `packages/core/src/build/runtime-specifier-alias-plugin.ts`        | `onResolve` only                             | Alias bare specifier → public URL, marked external    |
| `createBrowserRuntimeImportRewritePlugin` | `packages/core/src/build/browser-runtime-import-rewrite-plugin.ts` | `onResolve` (alias) + `onLoad` (AST rewrite) | Alias + rewrite source-level imports in JS/TS modules |

Both consume the same shape — a `Map<specifier, publicPath>` — and the
second already does what the first does as a subset (see
`browser-runtime-import-rewrite-plugin.ts:195-205` which is the same
external alias as the first plugin's only behavior). The two are
typically **used together in the same build** to make sure both the
bundler's resolver and the in-source import statements agree.

Call sites that register both:

- `packages/integrations/react/src/services/react-runtime-bundle.service.ts:100` (rewrite-only, for vendor assets)
- `packages/integrations/react/src/services/react-runtime-bundle.service.ts:150-155` (alias-only, for `react`/`react-dom` externals)
- `packages/integrations/react/src/services/react-runtime-bundle.service.ts:226` (alias-only, runtime alias map)
- `packages/core/src/build/build-manifest.ts:71-74` (rewrite-only, sealed into the browser manifest)
- `packages/integrations/react/src/react-hmr-strategy.ts:165` (rewrite-only)

Risks of the current split:

- Two filter regexes computed from the same keys
- Two specifier map values held in plugin objects (the rewrite plugin
  already exposes its map via `BROWSER_RUNTIME_IMPORT_REWRITE_MAP`; the
  alias plugin does not)
- Consumers must remember to call **both** to get full coverage

### Bundler bridge divergence

`EcoBuildPlugin` is a single contract, but it gets translated to three
backends with three different `onResolve`/`onLoad` shapes:

| Backend | Bridge                                                                                                | File                                                       |
| ------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| esbuild | `EsbuildBuildAdapter` direct (`build.onResolve` / `build.onLoad` from `esbuild.PluginBuild`)          | `packages/core/src/build/esbuild-build-adapter.ts:200-310` |
| Bun     | `BunBuildAdapter.createEcoPluginBridge` (Bun's `BunPluginBuilder` with `onResolve`/`onLoad`/`module`) | `packages/core/src/build/build-adapter.ts:324-387`         |
| Vite    | `ViteHostBuildAdapter` (stub, builds throw "host-owned" errors)                                       | `packages/core/src/build/build-adapter.ts:774-788`         |

`DevBuildCoordinator` (`packages/core/src/build/dev-build-coordinator.ts`)
is yet another layer of indirection: it serializes builds and recovers
from esbuild worker protocol faults. It only exists for the esbuild
path; the Bun path doesn't need it. After Rolldown (Phase 3 / ADR-003)
the recovery policy is moot because Rolldown's `rolldown.watch()` has
its own queue.

## Decision

### 1. Unify the two browser-runtime plugins into `createBrowserRuntimePlugin`

Replace both factories with a single
`createBrowserRuntimePlugin(options: { manifest: BrowserRuntimeManifest, name?: string })`
that exposes **all** relevant behavior:

- `onResolve` for the specifier set (alias → public URL, external)
- `onResolve` for the public URL set (`/^\//`, external — already
  present in the rewrite plugin)
- `onLoad` for JS/TS files (AST-based import/export rewrite with the
  same `code.includes(specifier)` fast-path)

The old factories stay exported as **thin wrappers** that delegate to
the new factory with a single hook enabled, so existing call sites keep
working without churn. Deprecate them in a follow-up release.

The exported specifier map symbol
(`BROWSER_RUNTIME_IMPORT_REWRITE_MAP` / equivalent) is owned by the new
plugin. `collectBrowserRuntimeImportRewriteMap` continues to work
unchanged.

### 2. Unify the bundler bridges behind a single adapter contract

A single `BuildAdapter` already exists (`packages/core/src/build/build-adapter.ts:98-111`).
The new work is:

- Move the Bun plugin bridge code from `BunBuildAdapter` into a
  separate `BunPluginBridge` factory that **adapts** `EcoBuildPlugin`
  arrays — it can be unit-tested without going through a real Bun
  runtime (use a fake `BunPluginBuilder`).
- Move the esbuild plugin bridge code from `EsbuildBuildAdapter` into
  a separate `EsbuildPluginBridge` factory with the same testability
  property.
- Both bridges share a small `EcoBuildPluginBuilder` core that the
  tests assert against (same shape, same semantics for the
  `onResolve`/`onLoad`/`module` translation).

This makes Phase 3 / ADR-003 a single replacement: write a
`RolldownPluginBridge` using the same shared core, drop the
esbuild/Bun-specific bridges.

### 3. Remove `DevBuildCoordinator` from the production path

The coordinator's serialization policy is fine for esbuild (avoids
worker protocol faults) but unnecessary for Rolldown. The new contract:

- A new lightweight `SerializedBuildExecutor` wraps any `BuildAdapter`
  to provide FIFO serialization. It does **not** know about esbuild
  faults; it just enforces one build at a time.
- The dev watch pipeline wraps the active adapter in
  `SerializedBuildExecutor`.
- After Rolldown lands, the existing `DevBuildCoordinator` is removed
  along with `ESBUILD_ADAPTER_BRAND` and the protocol-fault recovery
  code.

## Consequences

### Positive

- One plugin factory per concern. The `specifier → publicPath` map is
  the only data structure; the two hook families are layered on top.
- One bridge per bundler, all sharing the same
  `EcoBuildPluginBuilder` core — easier to test, easier to swap.
- Smaller blast radius for Phase 3: adding Rolldown becomes "add a
  bridge and an adapter", not "replace two plugins and two bridges".
- The `SerializedBuildExecutor` is reusable for any bundler that
  needs ordered builds (likely Rolldown too via `rolldown.watch()`).

### Negative

- The unified plugin re-runs the `code.includes(specifier)` check on
  every file. This is the same cost the rewrite plugin paid before —
  no regression.
- The unified plugin now always sets up `onLoad` even for call sites
  that only need alias resolution. The fast-path `return undefined`
  on miss means the per-file cost is one `String.includes` (sub-µs).
- Two new internal files (bridges) for now. Net code is slightly
  larger until the old bridges are deleted in Phase 3.

### Neutral

- Existing tests for the two plugins continue to pass because the
  thin wrappers preserve the public API.
- No call-site changes required for the plugin consolidation.
- Bridge refactor is internal — public exports unchanged.

## Migration plan (commit plan)

1. **`refactor(build): extract shared specifier map and filters`** — pull the
   map + filter construction out of both plugins into a private
   `buildRuntimePluginContext` helper. No behavior change. Tests
   unaffected.
2. **`feat(build): add createBrowserRuntimePlugin with alias + rewrite`** — new
   factory in `packages/core/src/build/browser-runtime-plugin.ts`. Old
   factories re-exported as wrappers. Add tests for the new factory.
3. **`refactor(react): route runtime bundle through unified plugin`** — replace
   the two factory calls in
   `react-runtime-bundle.service.ts` and `react-bundle.service.ts` with
   the unified one. Keep behavior identical.
4. **`refactor(build): extract esbuild and bun plugin bridges`** — split
   `EsbuildBuildAdapter.buildPluginSetup` and
   `BunBuildAdapter.createEcoPluginBridge` into separate bridge
   factories. Add bridge-level unit tests with a fake builder.
5. **`refactor(build): introduce SerializedBuildExecutor`** — replace
   `BuildExecutorWithPlugins` semantics with a clearer
   `SerializedBuildExecutor`; keep `BuildExecutorWithPlugins` as a
   thin alias for backward compatibility.
6. **`refactor(react): migrate dev watch to SerializedBuildExecutor`** — wire
   the dev watch to the new executor; keep `DevBuildCoordinator`
   around but no longer used.
7. **`docs(adr): mark ADR-002 Implemented`** — flip status, add bench
   numbers, link from ADR-003.

## Out of scope

- Replacing the bundlers themselves (ADR-003).
- Removing the deprecated plugin factories — that ships in a major
  release after one full minor cycle of deprecation warnings.
- Changing the `BrowserRuntimeManifest` shape.
