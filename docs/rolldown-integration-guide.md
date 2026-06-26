# Rolldown Integration Guide

Practical knowledge gained from integrating Rolldown into Ecopages, including performance findings, API patterns, and architectural decisions.

> **Rolldown homepage**: [rolldown.rs](https://rolldown.rs) — Rust-based bundler for JavaScript with Rollup-compatible API and esbuild feature parity.
>
> **GitHub**: [github.com/rolldown/rolldown](https://github.com/rolldown/rolldown)
>
> **Watch mode design**: [meta/design/watch-mode.md](https://github.com/rolldown/rolldown/blob/main/meta/design/watch-mode.md)
>
> **Rollup plugin compatibility**: [rolldown.rs/reference/plugin-hooks](https://rolldown.rs/reference/plugin-hooks)

---

## Why Rolldown-Only?

Ecopages bundles with Rolldown across every runtime (Node, Bun, browser). The decision to drop the previous esbuild and Bun-native adapters was driven by:

- **HMR cycle.** Rolldown keeps the Rust core warm between rebuilds via `watch()` where needed; Ecopages route-module and browser-HMR profiles use parallel one-shot Rolldown builds backed by production caches.
- **Single AST pipeline.** Rolldown is built on oxc. Ecopages plugins already use `oxc-parser` for AST walks. One Rust dependency tree, no plugin-side parser duplication.
- **One option surface.** Every esbuild option (`define`, `jsx`, `loader`) needed a hand-mapped counterpart for the Bun adapter, and Bun's option set drifted independently. Rolldown is the only option set to maintain.
- **Bench wins.** Across 18 kitchen-sink scenarios, Rolldown wins 15 and ties/beats the geometric mean by **1.21×** versus esbuild. Biggest wins: React page rebuilds (1.56×), production single page (1.49×), Lit (1.52×), Ecopages-JSX (1.47×). See [Performance Benchmarks](#performance-benchmarks) for the full table.

Vite is still supported as a host-owned boundary (`ViteHostBuildAdapter`) for users who need its plugin ecosystem, but Ecopages does not maintain a Vite plugin — Vite itself can use Rolldown via `rolldown-vite`.

---

## Plugin Hook Filters (Critical for Performance)

Rolldown evaluates plugin hooks on the Rust side and **only calls your JavaScript handler when the filter matches**. Without filters, every module triggers every hook through Rust→JS FFI, causing **3–4× slowdown** with multiple plugins.

```typescript
// ❌ BAD — Rolldown calls this for every module
resolveId(source, importer) { /* ... */ }

// ✅ GOOD — Rolldown skips this unless the filter matches
resolveId: {
  filter: { id: /\.tsx?$/ },
  handler(source, importer) { /* ... */ },
}
```

**If your patterns are dynamic** (populated at runtime during `buildStart`), you **cannot** use Rolldown's filter mechanism because the filter is read at plugin registration time, before `buildStart` runs. In this case, consolidate all dynamic plugins into a **single** Rolldown plugin to minimize FFI calls.

See: [rolldown.rs/reference/plugin-hooks](https://rolldown.rs/reference/plugin-hooks)

---

## Consolidate Plugins

Each Rolldown plugin adds FFI overhead per module for every hook. With 10+ plugins, this compounds rapidly. **Merge all plugins into a single Rolldown plugin** and route internally:

```typescript
// ❌ BAD — N plugins × M hooks = N×M FFI calls per module
plugins: [
	pluginA(), // resolveId + load
	pluginB(), // resolveId + load
	pluginC(), // resolveId + load
	// ...10+ more
];

// ✅ GOOD — 1 plugin × M hooks = M FFI calls per module
plugins: [createConsolidatedPlugin([pluginA, pluginB, pluginC /* ... */])];
```

Ecopages implements this in `rolldown-plugin-bridge.ts` — all `EcoBuildPlugin` instances are merged into one Rolldown plugin with JavaScript-side routing.

---

## BuildRuntime Profile Executors

Ecopages installs one `BuildRuntime` on `appConfig.runtime.buildRuntime` with three profiles:

| Profile | Executor | Use case |
| ------- | -------- | -------- |
| `server-entry` | `SerializedBuildExecutor` | Single-flight server entry builds |
| `route-module` | `ParallelBuildExecutor` | Route module transpilation and browser bundles |
| `browser-hmr` | `ParallelBuildExecutor` | HMR browser entry rebuilds |

All profiles wrap the same one-shot `RolldownBuildAdapter` in both dev and production. Repeated work is amortized through production build caches (`production-build-cache.ts`, route-module disk cache, server-entry cache) rather than a long-lived dev engine instance.

See [`packages/core/src/build/README.md`](../packages/core/src/build/README.md) for the full build-layer map.

---

## Rolldown Watch Mode (`watch()` API)

The `watch()` API monitors files and rebuilds automatically:

```typescript
import { watch } from 'rolldown';

const watcher = watch({
	input: 'src/index.ts',
	plugins: [myPlugin()],
});

watcher.on('event', (event) => {
	if (event.code === 'BUNDLE_END') {
		console.log('Build completed in', event.duration, 'ms');
		event.result.close(); // Important: close to avoid resource leaks
	}
});

watcher.close(); // Stop watching
```

Key differences from Rollup's watch:

- **One bundler per output** (Rollup: one build, multiple writes)
- **`buildStart` called once per output** (Rollup: once per config)
- **No shared module graph** across outputs

See: [meta/design/watch-mode.md](https://github.com/rolldown/rolldown/blob/main/meta/design/watch-mode.md)

---

## Build Adapter Pattern

Ecopages uses a `BuildAdapter` pattern with two implementations:

| Adapter                | Ownership     | Use Case                        |
| ---------------------- | ------------- | ------------------------------- |
| `RolldownBuildAdapter` | `'rolldown'`  | Default bundled backend         |
| `ViteHostBuildAdapter` | `'vite-host'` | Host-managed builds (Vite)      |

Runtime code accesses executors through `requireBuildRuntime(appConfig).getProfile(...)`.

---

## Browser vs Node Target

Rolldown's `platform` option affects module resolution and built-in handling:

```typescript
// Browser build — no Node polyfills, tree-shaking enabled
rolldown({ platform: 'browser' /* ... */ });

// Node build — resolves node: imports
rolldown({ platform: 'node' /* ... */ });
```

**Skip server-side plugins for browser builds** to avoid unnecessary overhead:

```typescript
plugins: [
	...(target !== 'browser' ? [createServerSideCssShimPlugin()] : []),
	...createRolldownPluginBridge(plugins, contextRoot),
];
```

---

## `experimental.nativeMagicString`

Enable Rust-native string manipulation for faster AST-based code transformations:

```typescript
rolldown({
	experimental: {
		nativeMagicString: true,
	},
});
```

This avoids JavaScript-side `MagicString` overhead for source map generation and code transforms.

---

## External Packages

Use the `external` function for fine-grained control:

```typescript
rolldown({
	external: (id) => {
		// Keep node: imports external
		if (id.startsWith('node:')) return true;
		// Bundle app-local TypeScript packages
		if (isAppPackageImport(id)) return false;
		// Externalize other packages
		return isPackageImport(id);
	},
});
```

Cache `createRequire` instances per context root to avoid repeated allocation. In Ecopages the cache is owned by the adapter instance (not module-level) so different adapter instances don't share state:

```typescript
class RolldownBuildAdapter {
	private readonly appRootRequireCache = new Map<string, NodeJS.Require>();

	private getAppRootRequire(contextRoot: string): NodeJS.Require {
		const cacheKey = path.resolve(contextRoot);
		let req = this.appRootRequireCache.get(cacheKey);
		if (!req) {
			req = createRequire(path.join(cacheKey, 'package.json'));
			this.appRootRequireCache.set(cacheKey, req);
		}
		return req;
	}
}
```

---

## Performance Benchmarks

Rolldown vs esbuild on the kitchen-sink fixture (10+ plugins: KitaJS, React, Lit, MDX, PostCSS/Tailwind, Image Processor). Median build time, lower is better. Rolldown wins 15/18 scenarios; geometric mean speedup is **1.21×**.

| Scenario                                              | esbuild (ms) | Rolldown (ms) |   Speedup |
| ----------------------------------------------------- | -----------: | ------------: | --------: |
| React page rebuild (react-lab.react.tsx)              |        2.994 |         1.915 | **1.56×** |
| production single page (minify + treeshake)           |        2.991 |         2.005 | **1.49×** |
| repeated rebuild of a single React page               |        2.882 |         1.942 | **1.48×** |
| React page (.react.tsx)                               |        2.816 |         1.928 | **1.46×** |
| Lit page (.lit.tsx)                                   |       10.053 |         6.622 | **1.52×** |
| Ecopages-JSX page (.eco.tsx)                          |       10.191 |         6.937 | **1.47×** |
| heavy React page                                      |        2.734 |         1.938 | **1.41×** |
| layout rebuild (base-layout.kita.tsx)                 |        3.037 |         2.326 | **1.31×** |
| React server-metadata page (.react.tsx)               |        5.063 |         4.359 |     1.16× |
| production all pages (minify + treeshake + splitting) |        5.665 |         5.099 |     1.11× |
| concurrent rebuilds (5 parallel)                      |        6.315 |         5.943 |     1.06× |
| shared-component rebuild (react-counter.react.tsx)    |        2.836 |         2.708 |     1.05× |
| KitaJS page (.kita.tsx)                               |        3.597 |         3.423 |     1.05× |
| KitaJS transitions page (.kita.tsx)                   |        4.203 |         4.051 |     1.04× |
| React server-files index (.react.tsx)                 |        5.100 |         4.959 |     1.03× |
| KitaJS postcss page (.kita.tsx)                       |        3.293 |         3.477 |     0.95× |
| KitaJS dynamic route catalog/[slug].kita.tsx          |        3.917 |         4.394 |     0.89× |
| no-op rebuild (file unchanged)                        |        2.790 |         3.787 |     0.74× |

Three scenarios regressed (KitaJS postcss, dynamic route, no-op rebuild). The no-op case is dominated by Rust startup overhead when every build creates a new `rolldown()` instance; route-module disk cache and fingerprinted production caches reduce repeated work on warm paths.

Benchmarks run via `ECOPAGES_BENCH=1 pnpm vitest bench`. The esbuild baseline was captured at commit `93fe9e6e` (Phase 0); the Rolldown numbers are post-plugin-consolidation.

---

## Common Pitfalls

1. **Don't create new `rolldown()` instances without closing them** — The `RolldownBuild` instance holds native resources. Always close it after `write()` or `generate()`, and prefer production caches for warm rebuild paths.

2. **Don't use plain function hooks without filters** — Rolldown calls them for every module through FFI. Use `{ filter, handler }` format or consolidate plugins.

3. **Don't forget `bundle.close()`** — The `RolldownBuild` instance holds native resources. Always close it after `write()` or `generate()`.

4. **Don't mix up `Params` and `Query`** — `Params` come from URL path structure (`/blog/[slug]`), `Query` from search string (`?q=typescript`).

5. **Don't confuse `Dependencies` with JS imports** — Component `Dependencies` are metadata declarations (stylesheets, scripts), not JavaScript `import` statements. You need both.

---

## References

- [Rolldown homepage](https://rolldown.rs)
- [GitHub repository](https://github.com/rolldown/rolldown)
- [Rollup-compatible plugin API](https://rolldown.rs/reference/plugin-hooks)
- [Watch mode design doc](https://github.com/rolldown/rolldown/blob/main/meta/design/watch-mode.md)
- [DevEngine experimental API](https://rolldown.rs/reference/experimental)
- [Vite 8 + Rolldown announcement](https://voidzero.dev/posts/announcing-vite-plus-alpha)
- [Rolldown benchmarks (19k modules)](https://github.com/rolldown/benchmarks)
