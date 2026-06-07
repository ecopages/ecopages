# ADR-003: Rolldown as the sole bundler

- **Status:** Implemented
- **Date:** 2026-06-06
- **Authors:** opencode
- **Depends on:** ADR-002 (plugin + bridge consolidation must land first)
- **Supersedes:** —

## Context

Ecopages today has **two** real bundler adapters and **one** stub:

| Adapter                | File                                               | Backend                                      | Status                                 |
| ---------------------- | -------------------------------------------------- | -------------------------------------------- | -------------------------------------- |
| `EsbuildBuildAdapter`  | `packages/core/src/build/esbuild-build-adapter.ts` | esbuild                                      | Active in Node dev/preview/static      |
| `BunBuildAdapter`      | `packages/core/src/build/build-adapter.ts:185-766` | Bun's native bundler (with esbuild fallback) | Active under `bun run dev`             |
| `ViteHostBuildAdapter` | `packages/core/src/build/build-adapter.ts:774-788` | Vite (host-owned)                            | Stub — only throws "host-owned" errors |

The reasons for the split were historical: esbuild was first, Bun's
native bundler was faster, and we wanted to keep Bun-native as a runtime
option. Reality in 2026:

- **Esbuild is the bottleneck in dev.** Per the Phase 0 bench, the
  bundle call is 4-9 ms median, but the **HMR** cycle (file watcher →
  rebuild → output → browser reload) is dominated by the esbuild
  worker-protocol fault recovery in
  `packages/core/src/build/dev-build-coordinator.ts:94-114`. Rolldown's
  `rolldown.watch()` has a single-process Rust core; no protocol
  fault, no `DevBuildCoordinator` needed.
- **Bun's bundler is the bottleneck in CI.** The Bun adapter
  re-implements output normalization for hash templates
  (`build-adapter.ts:439-516`) and a custom plugin bridge
  (`build-adapter.ts:324-387`) that's only testable under a real Bun
  runtime.
- **Oxc is already in use.** All AST-walking plugins use
  `oxc-parser`. Rolldown is built on oxc; the bundler and the AST
  tooling will share a single Rust dependency tree.
- **Esbuild is a maintenance tax.** Every new esbuild option
  (`define`, `jsx`, `loader`) needs a hand-mapped counterpart in the
  Bun adapter, and Bun's option set drifts independently
  (`build-adapter.ts:397-409`).

## Decision

Adopt **Rolldown** as the sole bundler for both Node and Bun runtimes.
Deprecate `EsbuildBuildAdapter`, `BunBuildAdapter`, and
`DevBuildCoordinator`. Keep `ViteHostBuildAdapter` for Vite hosts (a
different migration path, see [out of scope](#out-of-scope)).

### What goes

| Item                                       | Replaced by                         | File to delete                                      |
| ------------------------------------------ | ----------------------------------- | --------------------------------------------------- |
| `EsbuildBuildAdapter`                      | `RolldownBuildAdapter`              | `packages/core/src/build/esbuild-build-adapter.ts`  |
| `BunBuildAdapter`                          | `RolldownBuildAdapter`              | `packages/core/src/build/build-adapter.ts:185-766`  |
| `DevBuildCoordinator`                      | `rolldown.watch()`'s built-in queue | `packages/core/src/build/dev-build-coordinator.ts`  |
| `ESBUILD_ADAPTER_BRAND`                    | n/a (no more esbuild)               | n/a                                                 |
| `getBunRuntime()` branching in build paths | n/a                                 | `packages/core/src/utils/runtime.ts` (build branch) |

### What stays

| Item                               | Why                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `BuildAdapter` interface           | Rolldown implements it                                                                                                                  |
| `BuildOptions`                     | Mapped 1:1 to Rolldown's `BuildOptions`                                                                                                 |
| `BuildResult.outputs` shape        | Identical — Rolldown's `OutputBundle` is normalized by the adapter                                                                      |
| `BuildDependencyGraph`             | Rolldown exposes a `moduleGraph`; we map it to the existing shape                                                                       |
| `EcoBuildPlugin` contract          | Unchanged — Rolldown's plugin API (`resolveId`/`load`/`transform`) maps cleanly to `onResolve`/`onLoad` via the bridge added in ADR-002 |
| `BrowserRuntimeManifest` / plugins | Unchanged                                                                                                                               |

### New files

- `packages/core/src/build/rolldown-build-adapter.ts` — the new sole
  adapter. Implements `BuildAdapter` for both Node and Bun runtimes
  (Rolldown ships as a regular Node-compatible native module that
  works under Bun's Node compat).
- `packages/core/src/build/rolldown-plugin-bridge.ts` — translates
  `EcoBuildPlugin[]` to Rolldown's plugin array. Reuses the shared
  bridge core introduced in ADR-002.

### New behavior

- **Watch mode:** `rolldown.watch({...})` returns a
  `BuildWatcher`/`Watcher` instance. The dev HMR strategy subscribes
  to its events instead of polling a file watcher. Phase 0 e2e bench
  targets this path.
- **Module graph:** Rolldown's `moduleGraph` is consumed by
  `BuildAdapter.build()` to populate `BuildDependencyGraph` exactly
  the way esbuild's metafile did. The
  `EsbuildBuildAdapter.collectEsbuildMetafileEntries` block
  (`esbuild-build-adapter.ts:585-637`) becomes
  `RolldownBuildAdapter.collectRolldownModuleGraphEntries`.
- **CJS interop:** Rolldown's CJS handling differs from esbuild
  (better for `module.exports = ...` shapes). The React runtime
  asset bundles currently use ESM-only; no CJS test surface exists.
  The kitchen-sink bench verifies that `pnpm test:e2e` stays green.

## Consequences

### Positive

- **One bundler to maintain.** No more Bun vs esbuild option drift, no
  more dual bridges.
- **Faster HMR.** `rolldown.watch()` keeps the Rust core warm
  between rebuilds; the `DevBuildCoordinator` recovery loop is
  removed.
- **One AST pipeline.** oxc-parser in the JS plugins + oxc in
  Rolldown + oxc in any future tool (vite-plugin-oxc, oxc-transform)
  share the same dependency.
- **Smaller surface.** The 600-line `esbuild-build-adapter.ts` and
  the 600-line Bun section of `build-adapter.ts` collapse into one
  ~300-line `rolldown-build-adapter.ts`.

### Negative

- **Migration risk.** Every integration (React, KitaJS, Lit,
  Ecopages-JSX) and every external caller of `defaultBuildAdapter` is
  affected. We must run the full kitchen-sink bench + e2e suite
  before flipping the default.
- **esbuild-specific options.** A handful of options in
  `BuildOptions` are esbuild-specific (e.g. `externalPackages`,
  `splitting` flags). They need Rolldown-equivalent validation; if
  none exists, we drop the option with a deprecation warning.
- **`@rolldown/browser` vs Node.** Rolldown's browser-friendly build
  is smaller and faster; we should pin the Node-compatible one for
  dev/preview. The kitchen-sink build script needs to be reviewed.
- **No more esbuild metafile.** The metafile-based dependency graph
  in `EsbuildBuildAdapter` is replaced with Rolldown's
  `moduleGraph`. The `BuildDependencyGraph` shape stays the same
  externally; the internals change.

### Neutral

- `BuildOwnership = 'bun-native'` becomes meaningless. We can keep
  the type as `'rolldown' | 'vite-host'` for the migration window,
  then delete `'bun-native'` in the release after.
- The `BuildAdapter` contract is unchanged at the type level; only
  the implementations move.

## Migration plan (commit plan)

This is gated on ADR-002 (the bridge refactor) so the Rolldown
adapter can reuse the shared bridge core.

1. **`chore(deps): add rolldown to packages/core`** — pin
   `rolldown` at the same version used by Vite 8, then move to the
   stable 1.1.0 line. Workspace has both via pnpm dedupe.
2. **`feat(build): add RolldownPluginBridge using shared core`** —
   one new file; reuses ADR-002's bridge core. Bridge-level unit
   tests with a fake Rolldown plugin context.
3. **`feat(build): add RolldownBuildAdapter`** — implements
   `BuildAdapter.build/resolve/getTranspileOptions`. Wraps
   `rolldown.build()` and `rolldown.watch()`. 50% of the surface
   from `esbuild-build-adapter.ts:111-560` carries over; the rest is
   `moduleGraph` extraction.
4. **`test(build): golden output parity for RolldownBuildAdapter`** —
   for each `esbuild-build-adapter.test.ts` scenario, capture the
   Rolldown equivalent. The "differences" file is reviewed manually
   for the first migration PR.
5. **`refactor(core): swap defaultBuildAdapter to RolldownBuildAdapter`** —
   one-line default; behind `ECOPAGES_USE_ROLLDOWN=1` for the first
   minor release. Kitchen-sink e2e + bench verified.
6. **`refactor(core): drop esbuild + Bun adapters`** — delete
   `esbuild-build-adapter.ts`, the `BunBuildAdapter` class, the
   `getBunRuntime()` branching in build paths, and
   `dev-build-coordinator.ts`. Remove `ECOPAGES_USE_ROLLDOWN=1`
   gating.
7. **`chore(release): bump version to 0.3.0-alpha.1`** — deferred, not part of this work.
8. **`docs(adr): mark ADR-003 Implemented`** with bench numbers.

## Bench (target, post-ADR-003)

Per the Phase 0 baseline, the bundle path median is 4-9 ms. Target
post-Rolldown:

| Scenario                       | Phase 0 baseline | ADR-003 target | Expected speedup         |
| ------------------------------ | ---------------- | -------------- | ------------------------ |
| production single page         | 3.41 ms          | ≤ 3 ms         | 1.1-1.3×                 |
| no-op rebuild (file unchanged) | 2.87 ms          | ≤ 2 ms         | 1.4× (no fault recovery) |
| concurrent rebuilds (5×)       | 6.21 ms          | ≤ 5 ms         | 1.2×                     |
| React server-files             | 5.30 ms          | ≤ 5 ms         | parity                   |
| HMR end-to-end (e2e)           | not measured     | 1.0-1.5 s      | 1.3-2.0× over 2 s pain   |

We expect the **HMR e2e** number to be the headline win: dropping
esbuild protocol-fault recovery and using `rolldown.watch()` should
cut the user-visible 2 s HMR cycle to under 1.5 s.

## Out of scope

- **Vite host ownership.** `ViteHostBuildAdapter` stays. Vite is
  expected to remain a host option for users who need its ecosystem
  (vite-plugin-react etc.). A future ADR will evaluate whether Vite
  itself moves to Rolldown via `rolldown-vite`.
- **Browser-only Rolldown builds.** `@rolldown/browser` is interesting
  for in-browser demo sandboxes but is not a current use case.
- **Persistent on-disk caches.** Rolldown's Rust-side cache is
  sufficient; we do not add a JS-side persistent parse cache on top
  (ADR-001 stays in-memory).
- **esbuild removal from userland.** Users who import
  `esbuild-build-adapter.ts` directly will get a deprecation
  re-export for one minor cycle, then it is deleted.
