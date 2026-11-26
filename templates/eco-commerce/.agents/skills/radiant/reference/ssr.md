# SSR and hydration

Use the server pipeline as the integration boundary. Prefer explicit server entrypoints over custom globals.

## Contents

- Entrypoints
- Hydration
- Render scope
- Authoring notes

## Entrypoints

- `@ecopages/jsx/server` is Node-only.
- Outside the browser, import `@ecopages/radiant/server/install-ssr-runtime` (or another Radiant server SSR entry) before rendering hosts so the light-DOM shim and scope adapters are installed.
- Element hosts: `renderComponent(...)` / `renderComponentToString(...)` from `@ecopages/radiant/server/render-component`, or `renderRadiantElementHostToString(host, options)` from `@ecopages/radiant/server/radiant-element-ssr`. For the view fragment without the host tag, `renderRadiantElementViewToString(host, options)` from the same entry; `host.renderViewToString()` and the `radiant-element-ssr-bridge` entry are gone. There is no Element Host instance API named `renderHostToString()`.
- JSX still understands a generic third-party contract: instances that implement `renderHostToString(options?)`. Radiant does not rely on that instance method; it adapts hosts through `withServerCustomElementRenderHook(...)` / the installed Radiant SSR runtime.
- Adapt richer framework-owned custom-element SSR through `withServerCustomElementRenderHook(...)` instead of adding framework-specific branches to generic JSX guidance.

Radiant SSR is light-DOM only, like the client render path.

SSR bundlers must externalize `@ecopages/*` so Node resolves one module instance (do not inline duplicate copies of ALS or adapters).

## Hydration

- On the client, import `@ecopages/radiant/client/install-hydrator` before loading component modules (or call `installRadiantHydrator()` from `@ecopages/radiant/client/hydrator` before custom elements upgrade). Without it, server-rendered hosts render fresh on first connect.
- `mode: 'hydrate'` stamps each serialized host with `data-radiant-ssr`. Read `isServerRendered`, not `hasHydrationMarkers`, to tell whether a host's content came from the server: markers exist only where a view has bindings. Plain-mode hosts are not stamped.
- In hydrate mode, a render-owning host inside another host's view hydrates with its parent: the parent keeps its server node and hands it its children, and its state, focus and typed input survive. Until the parent hydrates it is inert server markup, with no event bindings and no `onConnected()` / `updated()`. Define the parent host on the client too, or the nested host never hydrates. The order the two tags are defined in does not matter.
- In hydrate mode that nested host renders its children itself. Plain mode renders them as Authored Children, because the parent may never render on the client.
- A host the server rendered outside every host's view gets Authored Children, serialized once where its view places them (between `<!--radiant-slotted-->` comments, or in a `<template data-radiant-slotted>` when the view does not place them yet); the client adopts those nodes in place. When page-level JSX hydrates over it, the host takes the page JSX's Children Value, with live bindings, and follows later page renders.
- Page hydration keeps a server-rendered host's node only when its tag was defined before the page JSX was created. Otherwise the host is rebuilt.

## Render scope

Shared runtime state across nested renders or split entrypoints: store with `withActiveSsrScopeValue(...)`, read with `getActiveSsrScopeValue(...)`. Use `Symbol.for(...)` keys so state survives entrypoint boundaries. Radiant SSR context providers use the same scope.

Each hydrate-mode `renderToString(...)` starts its marker indexes at 0, even inside `withActiveSsrScopeValue(...)`. When sibling roots belong to one hydration root, wrap them in `withServerHydrationBindingState(createServerHydrationBindingState(), () => ...)` (from `@ecopages/jsx/server`) so the client sees one continuous marker stream.

Await async I/O (module loading, asset resolution) **outside** SSR scope helpers. Keep `withActiveSsrScopeValue(...)` / `withServerRadiantElementSsrRuntime(...)` (from `@ecopages/radiant/server/radiant-element-ssr`) callbacks synchronous around the render snapshot.

## Authoring notes

Guard browser-only code with `isServer` from `@ecopages/radiant/is-server`.

Prefer `renderToString(view, { mode: 'plain' })` or `renderToString(view, { mode: 'hydrate' })` over the legacy `hydrate: true` shape alone.

If code wraps, clones, or transforms JSX template results during SSR, preserve template metadata such as `rootLocalName` and `ssrIntrinsicProps` so intrinsic custom-element SSR specialization still works.
