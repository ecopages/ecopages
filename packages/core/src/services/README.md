# Core Services

This directory contains the app-owned service layer used by runtime startup, rendering, asset processing, browser bundling, and development invalidation.

## Purpose

Services in this directory exist to keep cross-cutting framework logic out of adapters, integrations, and processors.

Typical responsibilities include:

- server-module loading and transpilation
- browser bundle coordination
- asset processing and runtime asset declaration helpers
- server invalidation state and entrypoint dependency graphs
- HTML finalization and dependency injection

## Main Areas

- `module-loading/`: framework-owned config/app bootstrap loading and server-side source loading
- `assets/`: shared browser build coordination and processed asset pipelines
- `cache/`: page HTML cache stores, selective source-path invalidation, and request coordination
- `invalidation/`: file-change classification and invalidation policy
- `runtime-state/`: app-owned invalidation state and dependency graphs
- `runtime-manifest/`: node runtime manifest derivation and persistence
- `html/`: final HTML dependency injection and rewriter selection

The asset-processing service caches emitted file assets by source identity in development as well as production.
When a source file changes, its source hash or explicit invalidation removes the cached asset before the next render,
so shared layout styles do not need to be rebuilt for every navigated page while HMR remains fresh.

Browser runtime module assets resolve bare package roots through their ESM import target. For legacy packages without an `exports` map, they prefer `package.json#module` over CJS `main`; CJS resolution is only a compatibility fallback. Generated entries use `export *` for ESM files and explicit named re-exports for CJS files (so bindings such as React `jsx` exist on the vendor). A default binding is added only when the selected entry exposes one. Runtime vendors are package-root contracts: subpath imports need their own vendor declaration or remain in the consuming bundle.

## Design Rule

If a concern affects more than one integration or more than one runtime adapter, it usually belongs here instead of in a package-specific implementation.
