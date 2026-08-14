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
- `processor.ts`: asset-transformation contract for processors
- `runtime-capability.ts`: runtime compatibility declaration types
- `source-transform.ts`: bundler-neutral source-transform primitive with Ecopages adapters plus app-level Vite plugin composition helpers
- `eco-component-meta-plugin.ts`: component-identity attribution transform that uses a lexical `eco.` gate, then an Oxc `CallExpression` rewrite

## Ownership Rules

- Integrations own rendering semantics, hydration behavior, and integration-specific HMR strategy.
- Processors own asset semantics, cache ownership, and processor-specific watch behavior.
- Core owns lifecycle ordering, startup orchestration, and manifest assembly.
- The transform wraps native `eco.page()`, `eco.component()`, `eco.layout()`, and `eco.html()` factory options with `bindComponentIdentity()`. Factories retain the resulting `options.identity` on `config`, and runtime consumers read it through `getComponentIdentity()`. Browser, HMR, and server builds use the same source transform, so ownership and dependency diagnostics retain stable file attribution without a loader duplicate.

## Lifecycle Summary

1. Config build validates and prepares plugin contributions.
2. Core seals the app-owned build manifest.
3. Runtime startup calls runtime-only setup hooks.
4. Request-time rendering and development invalidation reuse those finalized contracts.
