# ecopages bundle benchmark

Lean Vitest-based benchmark suite for the React integration's bundle path.
Uses the `playground/kitchen-sink` example as a real-world workload.

## Scope (what we measure, what we don't)

**In scope (this bench):**
- `BrowserBundleService.bundle()` cost for the four HMR scenarios that the
  watcher actually triggers
- Production build cost (single page and all pages, minify + treeshake)
- Heavy-library scenario (page that pulls in `react-dom`, `lit`, `kitajs`,
  `mdx` and the ecopages core)
- Cross-integration cost: a representative page per integration
  (React simple, React server-metadata, React server-files, KitaJS,
  KitaJS dynamic route, Lit, Ecopages-JSX)
- Heap stability across 100 rebuilds

**Out of scope (deferred):**
- End-to-end HMR (file touch → chokidar → strategy → bundle → WS broadcast).
  The previous implementation kept failing the subprocess spawn under
  vitest's worker isolation. The user's "2s HMR" claim is now localized
  through the heavy-library bench (heavy page 67-190 ms p99 vs single page
  4-12 ms p99) — the bottleneck is library import graph, not bundling.
- Per-plugin micro-benchmarks. Sub-millisecond cost doesn't justify a
  bench harness.

## Run

```bash
# Run the bench (gated by ECOPAGES_BENCH=1 or by passing 'bench' to vitest)
pnpm test:bench

# Diff against the committed baseline
pnpm test:bench:compare
```

Without the gate, vitest excludes the bench path. The bench never runs in
default CI.

## Output

| File | Purpose |
|---|---|
| `results/vitest-bench.json` | Raw vitest `outputJson` from the latest run. Gitignored (regenerate freely). |
| `results/bench-baseline.json` | **Versioned** committed baseline. The source of truth for "where the bundle path was before optimization". Regenerate with `pnpm test:bench:baseline` and commit. |

The vitest `--compare` flag diffs the latest run against the baseline and
prints per-scenario ratios (e.g. `1.10x slower than baseline`).

## Versioning policy

`bench-baseline.json` is **committed**. Update it intentionally:

1. Land optimization work in a PR
2. Run `pnpm test:bench` locally
3. If numbers improve (or are within noise), update the baseline:
   ```bash
   pnpm test:bench:baseline
   git add playground/kitchen-sink/bench/results/bench-baseline.json
   ```
4. Mention the deltas in the PR description

This gives a versioned history of bundle-path perf over time.

## Baseline (Phase 1, post PR-1.1 + PR-1.2, 2026-06-06)

HMR scenarios (single integration, hot path):
```
Scenario                                          | median (ms) | p99 (ms) |   hz
--------------------------------------------------|-------------|----------|------
production single page (minify + treeshake)        |        2.88 |    5.63  |  348
production all pages (minify + treeshake + split)  |        5.76 |    9.59  |  174
heavy React page                                  |        2.40 |    5.15  |  416
React page rebuild                                |        2.84 |    5.85  |  352
layout rebuild                                    |        2.84 |    5.77  |  352
shared-component rebuild                           |        2.87 |    6.13  |  348
concurrent rebuilds (5 parallel)                   |        6.26 |   12.91  |  160
no-op rebuild (file unchanged)                     |        2.77 |    5.70  |  362
repeated rebuild (100 iters, memory probe)         |        2.78 |    5.45  |  359
```

Cross-integration (one representative page per integration):
```
Scenario                                          | median (ms) | p99 (ms) |   hz
--------------------------------------------------|-------------|----------|------
React simple (react-lab)                           |        2.86 |    5.86  |  350
React server-metadata                              |        5.05 |    8.23  |  198
React server-files                                 |        5.11 |    8.36  |  196
KitaJS (api-lab)                                   |        3.62 |    6.67  |  276
KitaJS transitions                                 |        4.20 |    7.74  |  238
KitaJS postcss                                     |        3.28 |    6.52  |  305
KitaJS dynamic route (catalog/[slug])              |        3.51 |    6.87  |  285
Lit (lit-entry)                                    |        9.52 |   15.59  |  105
Ecopages-JSX (eco-entry)                           |       10.25 |   16.47  |   98
```

**Phase 1 wins (PR-1.1 ModuleParseCache + PR-1.2 ClientGraphBoundaryCache):**

| Scenario | Phase 0 | Phase 1 | Speedup |
|---|---|---|---|
| production single page | 7.49 | 2.88 | **2.6×** |
| React page rebuild | 6.04 | 2.84 | **2.1×** |
| **React server-metadata** | **22.88** | **5.05** | **4.5×** |
| **React server-files** | **53.95** | **5.11** | **10.6×** |
| **Lit page** | **41.95** | **9.52** | **4.4×** |
| Ecopages-JSX | 27.85 | 10.25 | 2.7× |
| Concurrent rebuilds (5×) | 16.46 | 6.26 | 2.6× |
| no-op rebuild | 7.26 | 2.77 | 2.6× |

**Note on PR-1.2 (ClientGraphBoundaryCache):** the in-process bench
bypasses the HMR strategy, so the cache is not exercised in
`hmr-bench` or `integration-bench` (those paths go through
`BrowserBundleService.bundle()` which doesn't include the plugin).
The cache is real, unit-tested, and used in real HMR rebuilds (where
the strategy rebuilds a dep-graph's worth of files). A plugin-level
micro-bench was removed as low-value during the Phase 0 cut;
re-introduce it if the cache is suspected of regressing.

**Note on PR-1.5 (drop post-build re-parse pass):** deferred. The
post-build `rewriteBrowserRuntimeImportsInOutputs` is a safety net
that re-reads each emitted `.js`, re-parses it, and rewrites any
runtime specifiers esbuild missed (e.g., when esbuild hoists or
inlines an import through a different path). Removing it risks
bundles shipping with raw `react`/`react-dom` imports that the
browser can't resolve. The win is also marginal: the no-op rebuild
is 2.77 ms total; the post-build pass is sub-ms. Re-evaluate after
Rolldown (Phase 3) since Rolldown's tree-shaking and import
preservation are different from esbuild's.

## Files

- `_kitchen-sink-fixture.ts` — builds the kitchen-sink `EcoPagesAppConfig`
  via the public `ConfigBuilder` API.
- `_consolidate.ts` — reads `vitest-bench.json`, writes `bench-baseline.json`.
- `build-bench.bench.ts` — production bundle scenarios.
- `hmr-bench.bench.ts` — HMR scenarios (the 4 cases the watcher actually triggers).
- `heavy-bench.bench.ts` — heavy-library scenario.
- `integration-bench.bench.ts` — one representative page per integration.
- `memory-snap.bench.ts` — 100-iteration memory stability.
- `results/bench-baseline.json` — versioned baseline.
