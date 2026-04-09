# Kitchen Sink Nitro E2E Fix Handoff

Last reviewed: 2026-04-08

## Goal

Make the Nitro kitchen sink E2E suite trustworthy enough that a green run actually means the host/plugin path is healthy.

Do not stop after fixing stale assertions. The actual runtime bar is HMR plus stable mixed-router navigation.

## Canonical Repro Commands

Run the whole suite:

```sh
pnpm --dir playground/kitchen-sink-nitro exec playwright test
```

Run just the HMR spec:

```sh
pnpm --dir playground/kitchen-sink-nitro exec playwright test e2e/includes-hmr.test.e2e.ts --project kitchen-sink-nitro-e2e
```

Run the repeated-hop spec:

```sh
pnpm --dir playground/kitchen-sink-nitro exec playwright test e2e/integrations.test.e2e.ts --project kitchen-sink-nitro-e2e --grep "repeated browser-router hops"
```

Run the stale API-lab tour assertion:

```sh
pnpm --dir playground/kitchen-sink-nitro exec playwright test e2e/routes-and-shell.test.e2e.ts --project kitchen-sink-nitro-e2e --grep "full shell tour"
```

Run the SSR marker assertion:

```sh
pnpm --dir playground/kitchen-sink-nitro exec playwright test e2e/integrations.test.e2e.ts --project kitchen-sink-nitro-e2e --grep "preserves valid Lit SSR markers"
```

## Triage Order

Follow this order so the remaining failures carry real signal:

1. Fix the stale API-lab tour assertion.
2. Fix or intentionally rewrite the stale React-entry Lit-marker assertion.
3. Investigate the duplicate-DOM navigation bug.
4. Investigate include/layout HMR until the server-rendered shell actually updates.
5. Add stronger HMR coverage before declaring the task complete.

## Task 1: Fix the stale API-lab heading assertion

Edit:

- `playground/kitchen-sink-nitro/e2e/routes-and-shell.test.e2e.ts`

Current bad expectation:

```txt
Handlers registered directly from app.ts
```

Current source-of-truth page copy:

- `playground/kitchen-sink-nitro/src/pages/api-lab.kita.tsx`

Expected update:

- Assert the current host-API heading instead of the old `app.ts` wording.

This is a test-only fix.

## Task 2: Fix the stale React-entry Lit SSR marker assertion

Edit:

- `playground/kitchen-sink-nitro/e2e/integrations.test.e2e.ts`

Relevant source page:

- `playground/kitchen-sink-nitro/src/pages/integration-matrix/react-entry.react.tsx`

What changed:

- The React entry route renders a real `LitCounter`.
- The server HTML now includes declarative shadow DOM and Lit markers inside that shadow template.

Do not blindly preserve the old assertion.

Pick one of these outcomes deliberately:

1. If Lit SSR markers inside nested declarative shadow DOM are valid, replace the failing negative assertion with a more accurate one.
2. If the intended contract is that React entry must not emit Lit markers, then treat this as a rendering regression and fix the renderer instead.

My current read is that this is a stale test, not a renderer defect.

## Task 3: Investigate duplicate DOM after repeated browser-router hops

Failing spec:

- `playground/kitchen-sink-nitro/e2e/integrations.test.e2e.ts`

Failure artifact:

- `playground/kitchen-sink-nitro/test-results/integrations.test.e2e.ts-K-2f11c-epeated-browser-router-hops-kitchen-sink-nitro-e2e/error-context.md`

Observed behavior:

- After navigating to `/integration-matrix/lit-entry`, the page contains two copies of the entire shell.
- This is not just duplicated content inside one section.
- It includes duplicated header, nav, main, and footer nodes.

Most likely code areas:

- `packages/browser-router/src/client/eco-router.ts`
- `packages/browser-router/src/client/services/dom-swapper.ts`
- `packages/react-router/src/router.ts`

What to inspect first:

1. Whether a mixed-runtime handoff is causing both the old and new document owners to commit.
2. Whether `morphBody(...)` or `replaceBody(...)` preserves too much because of `data-eco-persist` handling.
3. Whether a navigation race causes one swap to run after another without aborting the previous DOM commit.
4. Whether view transitions plus persistence leave a whole app subtree mounted twice.

Useful search terms:

- `data-eco-persist`
- `eco:before-swap`
- `eco:after-swap`
- `performNavigation`
- `morphBody`
- `replaceBody`
- `adoptDocumentOwner`
- `resolveDocumentOwner`

What success looks like:

- The repeated-hop Playwright spec passes.
- The page contains exactly one matching Lit-entry heading after navigation.
- No duplicate shell nodes remain in the accessibility snapshot.

## Task 4: Investigate include/layout HMR until server-rendered output changes

Failing spec:

- `playground/kitchen-sink-nitro/e2e/includes-hmr.test.e2e.ts`

Files directly involved:

- `playground/kitchen-sink-nitro/e2e/includes-hmr.test.e2e.ts`
- `playground/kitchen-sink-nitro/src/includes/seo.kita.tsx`
- `playground/kitchen-sink-nitro/vite/ecopages-hot-update.ts`
- `playground/kitchen-sink-nitro/ecopages-app.ts`
- `playground/kitchen-sink-nitro/vite/nitro-host-module-loader.ts`

Important current fact:

- `ecopages:hot-update` already watches includes and layouts and already sends `full-reload`.

That means the remaining bug is probably not "Vite never noticed the file change".

Much more likely:

1. The Ecopages runtime import cache is stale after the reload.
2. The host-side module runner is not invalidating the changed include/layout dependency graph.
3. The Vite plugin is only doing browser-side reload work, but not invalidating the Ecopages server-side render pipeline.

Concrete hypothesis to test:

- `PageModuleImportService` or another runtime cache survives the change, so the reload fetches old HTML again.

Concrete debugging steps:

1. Add temporary logging inside `playground/kitchen-sink-nitro/vite/ecopages-hot-update.ts` to confirm `handleHotUpdate` fires for `src/includes/seo.kita.tsx`.
2. Confirm the browser receives the `full-reload` event.
3. Confirm the subsequent server response for `/docs` is regenerated from fresh source rather than a cached module instance.
4. Trace where Ecopages runtime invalidation is supposed to happen for shared include/layout changes in the Nitro host path.
5. If no runtime invalidation hook exists yet, add one instead of papering over the symptom in the test.

Do not accept a fix that only adds longer Playwright waits.

## HMR Coverage Still Missing

The current E2E suite does not cover enough to call HMR complete even after the include test is fixed.

Add or strengthen coverage for these cases:

1. Include edit updates a visible shell value and survives a real browser reload.
2. Layout edit updates all pages using that layout.
3. Page edit updates the active route without leaving duplicate shell nodes.
4. Component edit updates a route that consumes the component.
5. At least one HMR path should touch each integration boundary: Kita, Lit, and React.
6. Mixed-router navigation should still be clean after one or more HMR cycles.

Good candidate files for additional specs or extensions:

- `playground/kitchen-sink-nitro/e2e/includes-hmr.test.e2e.ts`
- `playground/kitchen-sink-nitro/e2e/integrations.test.e2e.ts`
- `playground/kitchen-sink-nitro/e2e/runtime-surfaces.test.e2e.ts`

## Minimum Definition of Done

Do not consider the task done until all of this is true:

1. `pnpm --dir playground/kitchen-sink-nitro exec playwright test` is green.
2. The API-lab and React-entry stale assertions are updated intentionally, not just removed without replacement.
3. The repeated-hop duplicate-DOM issue is fixed at the runtime level.
4. The include HMR spec proves a real server-rendered shell change, not just a websocket event.
5. At least one more HMR case beyond the include-title check exists, so the host/plugin path has broader coverage.

## Fast Context For The Next LLM

If you need a quick mental model before editing:

- The Nitro playground is using a local composed Vite plugin in `playground/kitchen-sink-nitro/vite/`.
- Dev and preview both boot today.
- Preview-specific alias issues are already fixed.
- The open problems are now mostly in HMR invalidation depth and mixed-router DOM ownership.
- Two of the four current failures are stale tests. Two still look like real bugs.
