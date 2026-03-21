# Core Services

This directory contains the app-owned service layer used by runtime startup, rendering, asset processing, browser bundling, and development invalidation.

## Purpose

Services in this directory exist to keep cross-cutting framework logic out of adapters, integrations, and processors.

Typical responsibilities include:

- server-module loading and transpilation
- browser bundle coordination
- asset processing and runtime asset declaration helpers
- runtime specifier registry management
- dev-graph and invalidation state
- HTML finalization and dependency injection

## Main Areas

- `server-loader.service.ts`: framework-owned config/app bootstrap loading
- `server-module-transpiler.service.ts`: server-side source loading seam
- `browser-bundle.service.ts`: shared browser build coordination
- `development-invalidation.service.ts`: file-change classification and invalidation policy
- `dev-graph.service.ts`: app-owned dependency graph and invalidation generation state
- `runtime-specifier-registry.service.ts`: app-owned bare-specifier registry
- `asset-processing-service/`: processed asset pipelines plus shared runtime asset helpers
- `html-transformer.service.ts`: final HTML dependency injection and attribute stamping

## Design Rule

If a concern affects more than one integration or more than one runtime adapter, it usually belongs here instead of in a package-specific implementation.
