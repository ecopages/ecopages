# ADR-001: Module-level parse cache for the bundle plugin chain

- **Status:** Implemented (PR-1.1, 2026-06-06)
- **Date:** 2026-06-06
- **Authors:** opencode

## Context

The React browser bundle runs four plugins that each parse the same `.tsx` file
with oxc-parser:

1. `eco-component-meta-plugin` (`packages/core/src/plugins/eco-component-meta-plugin.ts:490`)
2. `client-graph-boundary-plugin` (`packages/integrations/react/src/utils/client-graph-boundary-plugin.ts:812`)
3. `client-graph-boundary-plugin` again after edits (`:728-738`)
4. `browser-runtime-import-rewrite-plugin` (`packages/core/src/build/browser-runtime-import-rewrite-plugin.ts:227`)
5. The post-build `rewriteBrowserRuntimeImportsInOutputs`
   (`packages/core/src/build/esbuild-build-adapter.ts:153`) re-parses the
   **emitted** output for runtime-import rewriting.

Per the Phase 0 bench, the bundle call itself is fast (4-9 ms median on
`playground/kitchen-sink`) and per-plugin cost is sub-millisecond per file.
The end-to-end HMR pain reported by users (~2 s) is not in the bundle call
itself, but the per-rebuild parse work is still duplicated and will only get
worse as apps grow. We need a shared cache so any plugin (or post-build pass)
that re-parses the same `(path, content)` pair gets the cached AST.

## Decision

Introduce a single process-wide `ModuleParseCache` keyed by
`(absolute path, contentHash)`. Plugins and the post-build pass consult the
cache before calling `oxc-parser.parseSync`. The cache is exposed under
`@ecopages/core/cache/module-parse-cache` for plugins outside the core.

### Cache key

`contentHash` is a `rapidhash`-style 64-bit hash of the file contents, computed
on first read. We do **not** key on mtime because:

- mtime is not deterministic across CI/local copies
- a touched-but-unchanged file is a no-op rebuild; mtime changes invalidate
  the cache even though content is identical
- hashing 10-30 KB of source on demand is sub-microsecond

### Eviction

- Process-local `Map`, capped at 10 000 entries (LRU).
- LRU because the working set during a typical rebuild is small but the
  kitchen-sink has 30 `.tsx` files; the cap prevents unbounded growth when
  developers leave the dev server running for hours and cycle through many
  files.
- 10 000 entries is roughly 200 MB of AST memory worst case (heuristic; will
  tune after PR-1.1).

### Invalidation

None beyond LRU. The watcher invalidates the `clientGraphBoundary` cache
separately because that one is path-stable but content-sensitive. The parse
cache is content-hashed, so a `writeFile` with different content is a
different key — no invalidation needed.

### Where it lives

`packages/core/src/cache/module-parse-cache.ts` — one file, one class, one
`getOrParse(path, options)` API. Owned by core; consumed by core plugins
(eco-component-meta, browser-runtime-import-rewrite), the integration plugin
(client-graph-boundary in `packages/integrations/react/`), and the post-build
pass (`rewriteBrowserRuntimeImportsInOutputs`).

### Wire-up order (PR-1.1)

1. Add `packages/core/src/cache/module-parse-cache.ts` and the test.
2. Replace the four call sites listed above with `getOrParse(...)`.
3. Remove the post-build re-parse pass in `esbuild-build-adapter.ts:153-177`
   once `onLoad`-time rewriting is authoritative (PR-1.5).
4. Add a bench scenario: `hmr-bench.no-op-rebuild` that times a bundle call
   with no actual file change, to demonstrate the cache hit.

## Consequences

### Positive

- One `parseSync` per `(path, contentHash)` per process lifetime.
- Plugin code becomes simpler — no per-plugin "do I need to reparse?" checks.
- Survives into the Rolldown migration (Phase 3): Rolldown's Rust-side
  caching absorbs the bulk of the win, but the JS-side cache still helps
  for the post-build pass and any JS-only plugins we keep.

### Negative

- A new process-wide cache to manage. Risk of memory leak if LRU is broken.
- `contentHash` adds a per-file read overhead (mitigated by the existing
  `fileSystem.readFileSync` cache in `@ecopages/file-system`).
- If two plugins want different `parseSync` options (e.g. `moduleType`), the
  cache must key on options too. PR-1.1 ships with options in the key.

### Neutral

- The cache is not exposed to user code. Plugins only.
- The Bun adapter also goes through esbuild, so the cache helps both paths.

## Bench (before / after, 2026-06-06)

The bundle path on `playground/kitchen-sink`, median per-operation in ms.
The cache hits 4 of the 5 `parseSync` call sites; the 5th
(`ecopages-virtual-imports.ts`) is a non-plugin path left untouched.

| Scenario                         | Before (Phase 0) | After (PR-1.1) | Speedup   |
| -------------------------------- | ---------------- | -------------- | --------- |
| production single page           | 4.99             | 2.98           | **1.7×**  |
| production all pages (splitting) | 6.64             | 5.65           | 1.2×      |
| heavy React page                 | 3.55             | 2.71           | 1.3×      |
| React page rebuild               | 4.24             | 2.85           | 1.5×      |
| layout rebuild                   | 4.19             | 2.85           | 1.5×      |
| shared-component rebuild         | 4.22             | 2.83           | 1.5×      |
| concurrent rebuilds (5×)         | 11.61            | 6.21           | **1.9×**  |
| no-op rebuild                    | 4.11             | 2.78           | 1.5×      |
| **React server-metadata**        | **22.88**        | **5.07**       | **4.5×**  |
| **React server-files**           | **53.95**        | **5.29**       | **10.2×** |
| KitaJS (api-lab)                 | 7.66             | 3.62           | 2.1×      |
| **Lit page**                     | **41.95**        | **9.86**       | **4.3×**  |
| **Ecopages-JSX**                 | **27.85**        | **10.39**      | **2.7×**  |
| repeated rebuild (100 iters)     | 4.16             | 2.87           | 1.4×      |

The largest wins are on the heavy pages — server-files drops 10×, Lit
4× — because the cache amortizes the cost of re-parsing the shared
`react`/`react-dom`/`lit`/etc. imports on every rebuild.

**Memory:** 100 rebuilds stable; LRU cap of 10 000 entries prevents
unbounded growth.

**All criteria met:**

- ✅ Existing plugin tests unchanged (23 eco-component-meta, 12 client-graph-boundary, 8 cache tests all pass)
- ✅ `no-op rebuild` p99 7.82 → 5.77 ms (-26%)
- ✅ 100 rebuilds heap stable
- ✅ `pnpm test:bench:compare` shows the deltas

## Out of scope

- A persistent on-disk parse cache. In-memory is sufficient for HMR; prod
  builds run once.
- esbuild's `context()`/`rebuild()` reuse (PR-1.7, optional).
- Rolldown hook filters (Phase 3).
