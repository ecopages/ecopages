# ADR: Layout assignment is explicit on pages

**Status:** Accepted  
**Date:** 2026-07-05

## Context

Pages need a predictable layout stack for ownership validation, dependency collection, client graph boundaries, and SPA layout caching.

## Decision

Layouts are assigned on each `eco.page({ layout })` call — either one declared layout component or an outer→inner array. EcoPages normalizes the stack at factory time to `config.layouts` and `config.layoutEntries`.

EcoPages does **not** infer layouts from `src/layouts` file paths or from route segment directories. A file under `src/layouts/` is only used when a page imports it and passes it to `layout`.

## Consequences

- Every page's layout stack is known from the page module before render.
- Routers and SSR integrations read `config.layouts` / `layoutEntries` rather than walking the filesystem for layout segments.
