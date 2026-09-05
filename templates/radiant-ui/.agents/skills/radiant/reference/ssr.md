# SSR and hydration

Use the server pipeline as the integration boundary. Prefer explicit server entrypoints over custom globals.

## Contents

- Entrypoints
- Host serialization
- Render scope
- Authoring notes

## Entrypoints

- `@ecopages/jsx/server` is Node-only.
- Outside the browser, import `@ecopages/radiant/server/install-ssr-runtime` (or another Radiant server SSR entry) before rendering hosts so the light-DOM shim and scope adapters are installed.
- Element hosts: `renderComponent(...)` / `renderComponentToString(...)` from `@ecopages/radiant/server/render-component`, or `renderRadiantElementHostToString(...)` from `@ecopages/radiant/server/radiant-element-ssr`. There is no durable Element Host instance API named `renderHostToString()`.
- JSX still understands a generic third-party contract: instances that implement `renderHostToString(options?)`. Radiant does not rely on that instance method; it adapts hosts through `withServerCustomElementRenderHook(...)` / the installed Radiant SSR runtime.
- Adapt richer framework-owned custom-element SSR through `withServerCustomElementRenderHook(...)` instead of adding framework-specific branches to generic JSX guidance.

Radiant SSR is light-DOM only. Hosts with `renderRootMode = 'shadow'` throw during server serialization; client shadow rendering remains valid.

SSR bundlers must externalize `@ecopages/*` so Node resolves one module instance (do not inline duplicate copies of ALS or adapters).

## Render scope

Shared runtime state across nested renders or split entrypoints: store with `withActiveSsrScopeValue(...)`, read with `getActiveSsrScopeValue(...)`. Use `Symbol.for(...)` keys so state survives entrypoint boundaries. Radiant SSR context providers use the same scope.

When you only need to share hydrate binding indexes across sibling `renderToString(...)` calls, use `withServerHydrationBindingState(...)`.

Await async I/O (module loading, asset resolution) **outside** SSR scope helpers. Keep `withActiveSsrScopeValue(...)` / `withRadiantElementSsrRuntime(...)` callbacks synchronous around the render snapshot.

## Authoring notes

Prefer `renderToString(view, { mode: 'plain' })` or `renderToString(view, { mode: 'hydrate' })` over the legacy `hydrate: true` shape alone.

If code wraps, clones, or transforms JSX template results during SSR, preserve template metadata such as `rootLocalName` and `ssrIntrinsicProps` so intrinsic custom-element SSR specialization still works.
