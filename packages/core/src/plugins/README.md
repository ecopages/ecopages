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
- `processor.ts`: asset-transformation contract for processors
- `runtime-capability.ts`: runtime compatibility declaration types
- `eco-component-meta-plugin.ts`: shared metadata transform used by core loading/build paths

## Ownership Rules

- Integrations own rendering semantics, hydration behavior, and integration-specific HMR strategy.
- Processors own asset semantics, cache ownership, and processor-specific watch behavior.
- Core owns lifecycle ordering, startup orchestration, and manifest assembly.

## Lifecycle Summary

1. Config build validates and prepares plugin contributions.
2. Core seals the app-owned build manifest.
3. Runtime startup calls runtime-only setup hooks.
4. Request-time rendering and development invalidation reuse those finalized contracts.
