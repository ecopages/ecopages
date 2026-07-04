# ADR: Segment layout inheritance (draft for v2)

**Status:** Draft  
**Date:** 2026-07-05

## Context

v0.2 ships nested layouts via explicit `eco.page({ layout: [Outer, Inner] })` arrays normalized at factory time. File-system segment layouts (e.g. `layouts/docs.tsx` wrapping `pages/docs/*`) are a separate inheritance model used by other frameworks.

## Decision (proposed)

Defer file-segment auto-layout inheritance to v2. v0.2 keeps layout assignment explicit on each page factory so ownership validation, dependency collection, and client graph boundaries remain deterministic.

## Open questions

- How segment layouts interact with `persistLayouts` per tier.
- Whether segment layouts merge with explicit `layout` arrays or override them.
- Static analysis rules for layout segment boundaries in the client graph plugin.

## Consequences

- Current API documents outer→inner arrays on `eco.page()` only.
- Routers and SSR paths do not infer layouts from directory structure in v0.2.
