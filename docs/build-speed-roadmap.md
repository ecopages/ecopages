# Build Speed Roadmap

Four sequential phases, each unblocking the next.

---

## Phase 1 — Parallel route module builds

**Goal:** reduce wallclock time for apps with many routes by building route modules concurrently.

### Background

Route modules are currently built one at a time inside
`.eco/.server-route-modules/`. Each build is independent — route modules do not
import each other — so there is no fundamental serialisation requirement. The
bottleneck is that `SerializedBuildExecutor` enforces a single-flight queue
per-executor, which is the right contract for the _server entry_ build but
wrong for the _route module_ build loop.

### Proposed approach

1. Introduce a `ParallelBuildExecutor` that wraps the same `BuildAdapter` but
   runs concurrent calls up to a configurable limit (default:
   `Math.max(1, os.availableParallelism() - 1)`).
2. The route-module build loop (wherever it currently calls `adapter.build`
   sequentially) switches to the parallel executor.
3. The server-entry build (`bundleServerEntry`) keeps `SerializedBuildExecutor`
   as-is — it is a single one-shot build, concurrency does not apply.

### Risk

Rolldown creates a fresh `rolldown()` instance per `build()` call. Parallel
instances are isolated; no shared mutable state has been observed. Validate
with a stress test running N concurrent builds against real source files before
removing the fallback serial path.

### Measurement

Baseline: `time pnpm build` on a kitchen-sink app (≥20 routes).
Target: wall-time proportional to `max_routes / parallelism` rather than
`max_routes`.

---

## Phase 2 — Route module caching (direct file hash)

**Goal:** skip rebuilds for route modules whose source file has not changed
since the last build.

### Background

Every `ecopages build` rebuilds all route modules unconditionally even when
nothing changed. For apps with expensive route modules (heavy imports,
processors), this is the dominant cost on subsequent builds.

### Proposed approach

1. After each successful route module build write a sidecar entry to
   `.eco/.server-route-modules/.build-cache.json`:

    ```json
    {
    	"/absolute/path/to/route.tsx": {
    		"sourceHash": "<sha256-of-source-file>",
    		"outputPath": ".eco/.server-route-modules/route.mjs",
    		"builtAt": 1718745600000
    	}
    }
    ```

2. Before building a route module, hash its source file and compare against
   the cache. If the hash matches and the output file exists, skip the build.

3. Cache is invalidated unconditionally when the core package version changes
   (existing `invalidationVersion` mechanism covers this).

### Scope

Direct file hash only — no dependency tracking. This is intentionally simple.
Phase 4 adds graph-aware invalidation on top.

### Correctness risk

If a route imports a shared layout and the layout changes, the direct hash
does not catch it. Accepted for this phase; documented as a known limitation.
Phase 4 resolves it.

---

## Phase 3 — Selective static generation (incremental)

**Goal:** only re-render static pages that are affected by a source change,
rather than regenerating the entire site on every build.

### Background

`StaticSiteGenerator.run()` iterates all routes and re-renders every page.
For large sites this is expensive even when only one source file changed.

### Prerequisite

Phase 2 must ship first. A reliable content-hash + cache manifest provides the
foundation to know which route modules are fresh vs stale. Building incremental
static gen on top of an unreliable cache would produce stale HTML silently.

### Proposed approach

1. Extend the cache manifest from Phase 2 with an additional field:

    ```json
    {
    	"/absolute/path/to/route.tsx": {
    		"sourceHash": "...",
    		"outputPath": "...",
    		"renderedOutputPath": "dist/about.html",
    		"renderedAt": 1718745600000
    	}
    }
    ```

2. Before rendering a page, check:
    - Is the route module cache hit? (source hash unchanged)
    - Does the rendered output file exist on disk?
    - If both → skip rendering.

3. Force a full rebuild when:
    - `ecopages.config.ts` changes (hash config file separately).
    - Any processor or integration signals a change (processors expose a
      `didChange()` hook or similar).
    - `--force` flag is passed explicitly.

### Correctness risks

- **Data dependencies:** pages that fetch external data at build time are stale
  even if their source file is unchanged. These pages must opt out of caching
  via `cache: 'dynamic'` (already the framework contract) or a new
  `revalidate: number` field (future work).
- **Shared layouts:** a layout change must bust all pages that use it.
  Phase 4 solves this for route modules; a similar mechanism is needed here
  for static rendering. Until Phase 4 ships, document that layout changes
  require a `--force` build.

---

## Phase 4 — Route module caching (graph-aware)

**Goal:** invalidate cached route modules (and their static renders) when any
file in their import graph changes, not just the direct source file.

### Background

Phase 2 only hashes the direct source file. If `route.tsx` imports
`shared-layout.tsx` and the layout changes, Phase 2 wrongly serves a cached
module. Phase 4 closes this gap.

### Foundation

Rolldown already produces a `moduleIds` array per output chunk (used today by
`BuildDependencyGraph`). This is the complete import graph for each entrypoint.

### Proposed approach

1. After each route module build, record the full `moduleIds` set in the cache
   manifest alongside the source hash:

    ```json
    {
    	"/route.tsx": {
    		"sourceHash": "<hash-of-route.tsx>",
    		"dependencyHashes": {
    			"/shared-layout.tsx": "<hash>",
    			"/utils/helpers.ts": "<hash>"
    		},
    		"outputPath": "...",
    		"builtAt": 0
    	}
    }
    ```

2. Cache hit condition becomes:
    - Direct source hash matches **and**
    - All dependency hashes match.

3. On a cache miss caused by a dependency change, only the affected route
   modules are rebuilt — not the entire site.

### Implementation notes

- Hash files lazily and memoize per build run to avoid redundant reads when
  multiple routes share the same dependency.
- `node:` builtins and `node_modules` paths are excluded from dependency
  tracking (they are covered by the core `invalidationVersion`).
- The dependency graph only covers the route module build. Static render
  inputs (processor outputs, public assets) are tracked separately via their
  own hashes.

---

## Summary

| Phase                      | Dependency | Risk   | Expected gain                        |
| -------------------------- | ---------- | ------ | ------------------------------------ |
| 1 — Parallel builds        | None       | Low    | High (wallclock ÷ CPU count)         |
| 2 — Direct hash cache      | None       | Low    | High (skip unchanged routes)         |
| 3 — Incremental static gen | Phase 2    | Medium | High (large sites)                   |
| 4 — Graph-aware cache      | Phase 2    | Medium | Medium (correctness fix for Phase 2) |
