# Dev Transform Server

Core-owned on-demand client module delivery for native `ecopages dev`.

## Purpose

Serve browser modules on demand during development instead of blocking SSR on upfront Rolldown page bundles. Production `ecopages build` stays on the Rolldown unified graph path unchanged.

## Model

Each source file under `src/` is transpiled independently to browser ESM:

1. Rolldown transpiles one module with all imports marked external (no app-graph bundling).
2. Integration plugins run as transforms (client-graph boundary, MDX, etc.).
3. Import specifiers are rewritten to:
    - `/assets/__eco_dev__/…` for project source modules (relative paths and tsconfig aliases)
    - `/assets/vendors/…` for bare npm imports (runtime manifest entries or lazy prebundles)

Imported stylesheet modules (`.css`) are materialized as default-exported CSS strings — the same graph contract as the server-side CSS shim (`createServerSideCssShimPlugin`): CSS stays in the import graph as a module while real stylesheet delivery uses `dependencies.stylesheets`. Lit `unsafeCSS()` and similar patterns work without a separate dev CSS pipeline.

The browser resolves the module graph natively. Heavy npm deps are prebundled once and served with cacheable headers.

## Layer ownership

| Layer            | Owner                                      | Responsibility                                       |
| ---------------- | ------------------------------------------ | ---------------------------------------------------- |
| Dev client       | `DevTransformServer` (`transform-server/`) | Transpile modules per HTTP request; in-memory cache  |
| Dev vendors      | `DevTransformVendorRegistry`               | Lazy prebundle bare npm imports to `/assets/vendors` |
| Dev invalidation | `DevelopmentInvalidationService` + watcher | Invalidate transform cache; signal browser reload    |
| Prod client      | Rolldown unified graph                     | Ship optimized browser assets                        |

## Key modules

- `transform-server/dev-transform-server.ts` — registers modules, serves transpiled ESM, memory cache only
- `transform-server/dev-transform-bundler.ts` — single-module transpile + import rewrite
- `transform-server/dev-transform-import-rewriter.ts` — rewrites static/dynamic import specifiers
- `transform-server/dev-transform-vendor-registry.ts` — lazy vendor prebundle and static serving
- `transform-server/dev-transform-url.ts` — stable `/assets/__eco_dev__/` URL prefix
- `transform-server/dev-transform-module-kind.ts` — script vs stylesheet materialization dispatch

Integrations register `getDevTransformBundleContributor()` to supply per-module Rolldown plugins for owned source files.

## Caching

- **Source modules**: in-memory cache keyed by content hash; `Cache-Control: no-store`
- **Vendor chunks**: written to `dist/assets/vendors/`; `Cache-Control: public, max-age=31536000, immutable`

No disk cache for transpiled source modules — per-file transpile is cheap enough that memory suffices.

Bare npm imports are lazily prebundled with package `"browser"` / `"exports.browser"` conditions (not Node `require.resolve`), so dual packages such as `@ecopages/core` ship the browser facade. Vendor prebundles run with `splitting: false`, exclude app build plugins, and apply integration-supplied client-graph boundary plugins so server-only graphs cannot reach the browser. Browser-target Rolldown builds fail hard on `node:*` builtins instead of emitting them as external script URLs.

Virtual modules such as `ecopages:images` are not externalized — app browser plugins inline them into the per-module transpile.

## HMR integration

`SharedHmrManager` owns one `DevTransformServer` per app. `DevTransformEntrypointRegistry` tracks registered entrypoints for invalidation. See [`../hmr/README.md`](../hmr/README.md).

`@ecopages/vite-plugin` remains optional for Vite-hosted apps; native CLI dev uses this transform path.

## Debugging consumer apps

To measure startup / SSR / transform cost in an external app against local `packages/*/dist`, use [`scripts/debug-app.bench.mjs`](../../../../scripts/debug-app.bench.mjs) (documented in [`scripts/README.md`](../../../../scripts/README.md)). Pass `--app` and `--paths`; do not commit app-specific harnesses in this repo.

## Shared browser vendors (`ecopages dev`)

High-fanout npm packages (React, `runtimeModules`, and lazy prebundles) resolve to stable `/assets/vendors/*` URLs. Page and layout modules under `/assets/__eco_dev__/` import those URLs instead of inlining `node_modules` into per-route output.

**Inspect cold cost in dev**

1. Open DevTools Network and filter `/assets/vendors`.
2. Expect one vendor file per shared package (for example `react-dom.development.js`, `zod.development.js`).
3. Page modules stay small; heavy deps live in vendors.
4. Second navigation to another route should reuse the same vendor URLs (browser cache / memory cache).

`*.development.js` filenames and large transfer sizes are expected in `ecopages dev` — that is React’s development build, not a missing vendor split.

**Reference fixture:** kitchen-sink `/vendor-share/a` and `/vendor-share/b` with e2e in `playground/kitchen-sink/e2e/shared-vendors.test.e2e.ts`.

The `.eco` workdir can accumulate dev artifacts (including dynamic-import chunks). Use Network + `/assets/vendors` for cold-cost audits, not raw `.eco` disk size alone.
