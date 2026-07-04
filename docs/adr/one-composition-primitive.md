# ADR: One composition primitive for document shells

**Status:** Accepted (v0.2 program)  
**Date:** 2026-07-05

## Context

Route rendering, explicit `renderToResponse()` views, and mixed-integration shells all needed to wrap a primary component with optional layout tiers and an HTML template. Parallel ad-hoc composition paths diverged in asset merging, locals handling, and SSR/client parity.

## Decision

Use `composeDocumentShell` in core as the single string-shell primitive. Integrations may supply an optional `composeChildren` hook to replace sequential string wrapping with a unified tree (React element children) while still delegating foreign subtrees through `renderComponentWithForeignChildren`.

## Consequences

- String-markup integrations keep the default sequential path unchanged.
- React SSR and hydration share `@ecopages/react/layout-compose` for layout trees.
- Custom hooks must return `primaryRender` assets when they skip the default primary render.
