# Core Services

This directory contains the app-owned service layer used by runtime startup, rendering, asset processing, browser bundling, and development invalidation.

## Purpose

Services in this directory exist to keep cross-cutting framework logic out of adapters, integrations, and processors.

Typical responsibilities include:

- server-module loading and transpilation
- browser bundle coordination
- asset processing and runtime asset declaration helpers
- runtime specifier registry management
- server invalidation state and entrypoint dependency graphs
- HTML finalization and dependency injection

## Main Areas

- `module-loading/`: framework-owned config/app bootstrap loading and server-side source loading
- `assets/`: shared browser build coordination and processed asset pipelines
- `invalidation/`: file-change classification and invalidation policy
- `runtime-state/`: app-owned invalidation state, dependency graphs, and runtime specifier registry
- `runtime-manifest/`: node runtime manifest derivation and persistence
- `html/`: final HTML dependency injection and rewriter selection

## Design Rule

If a concern affects more than one integration or more than one runtime adapter, it usually belongs here instead of in a package-specific implementation.
