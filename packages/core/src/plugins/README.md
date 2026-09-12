# Plugin Contracts

This directory contains the authoring contracts for Ecopages integrations, processors, and related plugin-facing runtime declarations.

## Purpose

The plugin layer defines what packages are allowed to declare about themselves, while core retains orchestration ownership.

These contracts are responsible for:

- integration registration and lifecycle hooks
- processor registration and asset capability declaration
- runtime capability declaration and validation input
- shared build-plugin bridge types used by integrations and processors

## Main Files

- `integration-plugin.ts`: framework-semantics contract for render integrations
- `define-integration.ts`: typed factory for integrations that only need declarative config and a renderer class
- `processor.ts`: asset-transformation contract for processors, including generated `@types` package helpers for virtual modules
- `runtime-capability.ts`: runtime compatibility declaration types
- `source-transform.ts`: bundler-neutral source-transform primitive with Ecopages adapters plus app-level Vite plugin composition helpers
- `component-import-discovery.ts`: resolves direct local factory exports, named `export { X } from` barrels (imported binding only), relative CSS imports, and aliased CSS imports; records successful named re-export hops as watch files; excludes `export *`, type imports, package imports, and ordinary helpers.
- `eco-component-meta-plugin.ts`: component-identity attribution transform for `eco.*()` factories and `attributeMdxComponentIdentity` for compiled MDX modules

## Ownership Rules

- Integrations own rendering semantics, hydration behavior, and integration-specific HMR strategy.
- Processors own asset semantics, cache ownership, and processor-specific watch behavior.
- Core owns lifecycle ordering, startup orchestration, and manifest assembly.
- The transform wraps native `eco.page()`, `eco.component()`, `eco.layout()`, and `eco.html()` factory options with `bindComponentIdentity()`. Factories retain the resulting `options.identity` on `config`, and runtime consumers read it through `getComponentIdentity()`. Browser, HMR, and server builds use the same source transform, so ownership and dependency diagnostics retain stable file attribution without a loader duplicate.
- MDX modules compiled by `@ecopages/mdx/core` use `attributeMdxComponentIdentity()` to strip bare CSS imports, attach live component accessors to `config.dependencies`, keep inferred stylesheets on identity, and assign `MDXContent.config = config`. The loader requires `projectRoot` from app config. Markdown code blocks and dynamic imports within functions are distinguished and left unaffected.

## Lifecycle Summary

1. Config build validates and prepares plugin contributions.
2. Core seals the app-owned build manifest.
3. Runtime startup calls runtime-only setup hooks.
4. Request-time rendering and development invalidation reuse those finalized contracts.
5. `DevelopmentInvalidationService.invalidateServerModules()` calls `Processor.invalidateServerArtifacts()` so processors can discard compiled server artifacts that are not part of the route-module graph.

## Discovered dependency metadata

The identity transform passes a deferred Component accessor and resolved stylesheet paths to `bindComponentIdentity`. Factories attach the deferred Component accessor to `config.dependencies`; inferred stylesheets stay keyed by identity for the collector. Import bindings are read during graph traversal, after module initialization. Supported relative and aliased CSS imports are removed from all transformed outputs so the asset pipeline owns CSS delivery. Explicit styles override discovery. Discovery follows named `export { X } from` barrels for the imported binding only. Successful named re-export hops are recorded as watch files on the discovering identity so a barrel retarget invalidates HTML and Page Browser Graph caches without editing the importing Page. It does not follow `export *`, dynamic imports, namespace imports, package Components/CSS, CSS Modules, or custom import attributes. The transform uses the same discovery rules in Bun and Vite/Rolldown. Imported source changes are reparsed through the content-keyed parser cache.
