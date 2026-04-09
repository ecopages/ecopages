# Kitchen Sink Nitro E2E Review Recap

Last reviewed: 2026-04-08

## Scope

This note is the current state handoff for the Nitro kitchen sink E2E suite and the local Nitro Vite plugin spike.

The suite was re-run with:

```sh
pnpm --dir playground/kitchen-sink-nitro exec playwright test
```

Result at review time:

- 28 passing tests
- 4 failing tests

## Current Failing Tests

| Status  | Spec                                                                                                                                            | Failure shape                                                               | Likely class                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------- |
| Failing | `playground/kitchen-sink-nitro/e2e/includes-hmr.test.e2e.ts`                                                                                    | Include edit does not change title after reload window                      | Real runtime/plugin issue                 |
| Failing | `playground/kitchen-sink-nitro/e2e/integrations.test.e2e.ts` (`server-renders matrix entry routes and preserves valid Lit SSR markers`)         | React entry HTML now contains Lit SSR markers inside declarative shadow DOM | Very likely stale assertion               |
| Failing | `playground/kitchen-sink-nitro/e2e/integrations.test.e2e.ts` (`keeps all integration counters interactive across repeated browser-router hops`) | Duplicate full app DOM appears after navigation to Lit entry                | Real runtime bug or cross-router swap bug |
| Failing | `playground/kitchen-sink-nitro/e2e/routes-and-shell.test.e2e.ts` (`completes a full shell tour across the major playground surfaces`)           | Test still expects old API-lab heading copy                                 | Stale assertion                           |

## Error Collection

### 1. Includes HMR currently fails

Spec:

- `playground/kitchen-sink-nitro/e2e/includes-hmr.test.e2e.ts`

Observed failure:

```txt
Expected: "Ecopages [include-hmr]"
Received: "Ecopages"
```

Supporting artifact:

- `playground/kitchen-sink-nitro/test-results/includes-hmr.test.e2e.ts-K-7106b-ed-include-template-changes-kitchen-sink-nitro-e2e/error-context.md`

Interpretation:

- The browser did not observe a changed server-rendered title after editing `src/includes/seo.kita.tsx`.
- The current Vite hot-update plugin does watch includes and does send `full-reload`, but that only proves the browser was told to reload.
- It does not prove the Ecopages server-side render path invalidated its module cache or refreshed the host-side module graph.
- This is the main reason HMR should still be considered incomplete.

### 2. React entry SSR assertion is outdated

Spec:

- `playground/kitchen-sink-nitro/e2e/integrations.test.e2e.ts`

Observed failure:

```txt
expect(reactEntryHtml).not.toContain('<!--lit-part')
```

Actual behavior:

- The React entry route renders a nested `LitCounter`.
- The returned HTML contains declarative shadow DOM with Lit markers inside `<template shadowroot="open">...</template>`.

Relevant route source:

- `playground/kitchen-sink-nitro/src/pages/integration-matrix/react-entry.react.tsx`

Interpretation:

- This looks like a test assumption that predates the current SSR shape.
- Unless the intended architecture is "React entry must never emit Lit SSR markers", this assertion should be updated rather than treated as a renderer bug.

### 3. Repeated browser-router hops can duplicate the full page shell

Spec:

- `playground/kitchen-sink-nitro/e2e/integrations.test.e2e.ts`

Observed failure:

```txt
strict mode violation: getByRole('heading', { name: 'The page entry can change while the matrix stays shared.' }) resolved to 2 elements
```

Supporting artifact:

- `playground/kitchen-sink-nitro/test-results/integrations.test.e2e.ts-K-2f11c-epeated-browser-router-hops-kitchen-sink-nitro-e2e/error-context.md`

What the snapshot shows:

- The full page shell is duplicated, not just the route body.
- Two banners, two nav sections, two footers, and two identical page bodies are mounted at once.

Interpretation:

- This looks like a real DOM swap or cross-router handoff bug.
- Candidate implementation area is not the test helper first. The stronger suspects are the browser-router DOM swap path and mixed-runtime handoff path.

Primary suspect files:

- `packages/browser-router/src/client/eco-router.ts`
- `packages/browser-router/src/client/services/dom-swapper.ts`
- `packages/react-router/src/router.ts`

### 4. API lab tour assertion is stale

Spec:

- `playground/kitchen-sink-nitro/e2e/routes-and-shell.test.e2e.ts`

Observed failure:

```txt
getByRole('heading', { name: 'Handlers registered directly from app.ts' })
```

Current page source:

- `playground/kitchen-sink-nitro/src/pages/api-lab.kita.tsx`

Current heading:

```txt
Host API routes served beside the Ecopages app
```

Interpretation:

- This is plain stale test text, not a runtime defect.

## Nitro Vite Plugin Recap

## Entry shape

The Nitro playground uses a local Vite plugin composition entry:

- `playground/kitchen-sink-nitro/vite/ecopages.ts`

The top-level `vite.config.ts` wires it like this:

- `plugins: [ecopages({ appConfig })]`

The local Vite config also aliases core source paths directly, including the important Node-safe alias:

- `@ecopages/core/create-app -> packages/core/src/adapters/node/create-app.ts`

That alias matters because preview previously booted against the Bun-only public entrypoint.

## Plugin composition order

The current plugin stack is composed in this order:

1. `ecopages:config`
2. `ecopages:metadata`
3. source-transform plugins from app config
4. `ecopages-virtual-modules`
5. `ecopages:islands`
6. `ecopages:hot-update`
7. Nitro host plugins via `nitro()`

Source files:

- `playground/kitchen-sink-nitro/vite/ecopages.ts`
- `playground/kitchen-sink-nitro/vite/plugin-api.ts`
- `playground/kitchen-sink-nitro/vite/ecopages-host-bridge.ts`

## What each bucket currently owns

`ecopages:config`

- Injects `rendererModuleContext` into `appConfig.runtime`.
- Merges aliases, `optimizeDeps.include`, and `ssr.noExternal`.
- File: `playground/kitchen-sink-nitro/vite/ecopages-config.ts`

`ecopages:metadata`

- Adapts core `__eco` component metadata transform into Vite.
- File: `playground/kitchen-sink-nitro/vite/ecopages-metadata.ts`

Source transform bucket

- Adapts app-config source transforms into Vite plugins.
- Reserved transform names are filtered so metadata is only registered once.
- File: `playground/kitchen-sink-nitro/vite/ecopages-source-transforms.ts`

Virtual modules bucket

- Serves generated image module, integration manifest module, and island registry module.
- File: `playground/kitchen-sink-nitro/vite/ecopages-virtual-modules.ts`

Islands bucket

- Serves a generated island client entry and mirrors the island registry onto `globalThis`.
- File: `playground/kitchen-sink-nitro/vite/ecopages-islands.ts`

Hot update bucket

- Watches `includes`, `layouts`, `pages`, `components`, and the local `vite` folder.
- Restarts the Vite dev server when files under `playground/kitchen-sink-nitro/vite` change.
- Sends `full-reload` for include and layout changes.
- Invalidates touched Vite modules for page/component changes and still sends `full-reload`.
- File: `playground/kitchen-sink-nitro/vite/ecopages-hot-update.ts`

Host bridge bucket

- Appends Nitro's native Vite plugins after Ecopages plugins.
- File: `playground/kitchen-sink-nitro/vite/ecopages-host-bridge.ts`

## Host module loading recap

Nitro server-side source imports are bridged through a host loader rather than through direct Vite knowledge inside core.

Relevant files:

- `playground/kitchen-sink-nitro/vite/nitro-host-module-loader.ts`
- `playground/kitchen-sink-nitro/ecopages-app.ts`

Current shape:

- `ecopages-app.ts` injects the Nitro host loader into core runtime state with `setAppHostModuleLoader(...)`.
- The host loader uses `globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__` and picks the active Nitro SSR environment.

This part is in better shape than the HMR path. The main unresolved issue is not raw source loading anymore; it is invalidation and refresh behavior.

## Why HMR is still not done

The current plugin can tell the browser to reload, but the failing include test suggests that server-rendered output is still stale after the reload.

That means at least one of these is still missing:

- The Ecopages app runtime cache is not being invalidated when includes/layouts change.
- The Nitro host module runner is not seeing the changed module graph for Ecopages-owned source.
- The current Vite-side `handleHotUpdate` hook is too shallow because it only talks to Vite's websocket/module graph and not to Ecopages runtime invalidation.

Practical summary:

- The plugin spike is good enough to boot dev and preview.
- It is not yet good enough to claim end-to-end HMR correctness for shared shell files.
