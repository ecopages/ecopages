# @ecopages/react

First-class integration for [React 19](https://react.dev/) in Ecopages. This plugin enables React SSR and client hydration, allowing you to build component-level React islands or full React Single Page Applications (SPAs).

## Installation

```bash
bun add @ecopages/react react react-dom
bun add -d @types/react @types/react-dom
```

## Usage

Configure the plugin in your `eco.config.ts`:

```ts
import { defineConfig } from '@ecopages/core/config';
import { reactPlugin } from '@ecopages/react';

export default defineConfig({ integrations: [reactPlugin()] });
```

## Component-Level Islands

For component-level islands, Ecopages React uses this contract:

- SSR output preserves the authored DOM structure (no unnecessary wrapper elements).
- A stable island host contract is stamped on the component SSR root via core (`data-eco-island`, `data-eco-island-integration`, `data-eco-component-id`, optional `data-eco-component-key` / `data-eco-props`).
- During non-HMR runtime rendering, island and lazy-entry client modules are built together from the page client plan, in one grouped browser build during route preparation. Static production export contributes React hydration and lazy entries, every Integration's Page Browser Graph entries, and HTML Page and `html.html` shell module scripts to compatible app-wide browser build groups. Hydration scripts import the recorded output URLs. Same-integration Page, Layout, and includes are hydrated by the page bootstrap. The Html shell is not an island, even when its Integration differs from the page owner. Only a React component whose Integration differs from its parent's, on another owner's page, receives a per-component island script. Those scripts join the page's assets during route preparation; SSR only stamps the host and never starts a per-island build.
- Each island component gets its own hydration script, keyed by its component identity. A file that exports several island components is built once and its declared modules are merged, while each component's hosts hydrate the export whose identity matches.
- The island runtime keeps the SSR host and its children in place and hydrates that host with `hydrateRoot()`. The host uses `display: contents` so it does not introduce an extra layout box. Full-page hydration paths also use `hydrateRoot()`.

> [!TIP]
> **Full React SPA Routing:**
> If you are building full React pages and want client-side navigation (SPA), use [@ecopages/react-router](../../react-router/README.md) and pass it to the react plugin: `reactPlugin({ router: ecoRouter() })`.

## MDX Support

The React plugin includes built-in MDX support. Add an `mdx` object to enable it; omit the property to disable MDX. You can write `.mdx` pages alongside `.tsx` pages with unified client-side routing, hydration, and HMR. Put `remarkPlugins`, `rehypePlugins`, and `recmaPlugins` next to `compilerOptions`, not inside it.

```ts
import { defineConfig } from '@ecopages/core/config';
import { reactPlugin } from '@ecopages/react';

export default defineConfig({
	integrations: [
		reactPlugin({
			mdx: {
				remarkPlugins: [],
				rehypePlugins: [],
				recmaPlugins: [],
			},
		}),
	],
});
```

## Mixed Rendering

The React integration can participate in mixed-renderer apps in three ways:

- React can own the page or view directly.
- React can render nested foreign subtrees inside pages owned by another integration.
- React can render through non-React page, layout, or document shells when those shell components return strings.

When a non-React render pass reaches a React-owned foreign child, Ecopages hands that foreign subtree back to the React renderer. When React renders through a non-React shell, that shell must serialize to HTML so React can insert the result into the final response without escaping it.

Important:

- Components that may render foreign children must declare those children in `config.dependencies.components`.
- Ecopages validates mixed-renderer ownership from declared dependencies during render preparation. It does not infer every foreign subtree from rendered HTML alone.
- Route-level dependency resolvers can supply Components at request time; React includes those resolved roots when deciding whether a Foreign Subtree needs handoff.
- React still keeps its own child transport and hydration rules for React-owned subtrees.
- React renderers use the required core `AssetProcessingService` to process declared component and MDX config dependencies.

React uses the shared core route and document-shell pipeline. Its renderer hooks supply the browser-safe page payload, unified React layout composition, document contributions and router ownership attributes.

## Server and Client Graph Contract

The React integration supports Node.js modules and server-only code **only on the server execution graph**.

- Server rendering can safely import `node:*` modules, database clients, filesystem utilities, etc.
- Client-hydrated React code must resolve to browser-safe modules only.
- If a server-only import crosses the boundary and becomes reachable by client code, **the client build will intentionally fail**.

Keep server helpers close, but separate them physically or logically so they do not leak into the client bundle.

The `.server` naming rule comes from the browser-safe `@ecopages/core/build/contracts` entry. React applies it during import pruning before core's browser resolution guard runs. A Page that uses `.server.ts` imports only in server options such as `middleware` still builds: the imports and server options are removed before resolution.

For a hydratable Page that renders collection MDX, call `createLazyCollectionComponents()` from `@ecopages/react/lazy-collection-components` once at module level with the collection's `/component` loader. Its `get(slug)` returns one `React.lazy` component per slug, so the Page reads `const Content = posts.get(entry.slug)` and renders `<Content />` inside a `<Suspense>` boundary. The server waits for the entry and sends it in the HTML, hydration keeps that HTML until the browser has loaded the entry, and `dependencies` stays server-only and is removed from the Page Browser Graph. Keep the boundary at a fixed place in the Page, not keyed by slug: when a client navigation moves to another entry, React then leaves the current Page on screen until the next entry has loaded instead of showing the fallback. When the browser cannot load an entry during a client navigation (a replaced chunk, a dropped connection), `@ecopages/react-router` falls back to a full navigation to that URL. A load that fails while the first Page hydrates is not retried by a reload: React discards that page. An error boundary of the Page's own around the entry catches the error first, so the router does not reload in that case. In development, an edited MDX file reloads the Page module, which creates a new lookup and loads the edited entry without a full reload.

## Client Graph Boundary Architecture

This section explains the internal contract used to keep the browser bundle minimal while preventing server-only code and request-only configuration from leaking into client output.

### Goal

The React integration has two jobs that must hold at the same time:

- Produce a browser-safe bundle for hydrated pages and islands.
- Preserve enough page code for hydration to reconstruct the same React tree the server rendered.

That means the client bundle must keep client-safe render logic, but it must drop server-only imports and server-only `eco.page(...)` options such as middleware and build-time metadata.

### Mental Model

Think about each React page as two related graphs:

1. **Server graph**: everything needed to render the page on the server. This graph may include middleware, request locals, database access, filesystem access, and other server-only modules.
2. **Client graph**: the smallest browser-safe subset needed to hydrate the rendered output in the browser.

The React integration builds the client graph conservatively. If a server-only module becomes reachable from the hydrated render path, the build should fail rather than silently shipping unsafe code.

The client-graph boundary analyzes project modules during each browser build and HMR rebuild; transform results and requested-export changes are not cached or replayed across builds. In grouped island builds, each entry file uses its own declared modules, while helper modules use the group's merged declarations because the build has one module instance for each helper. Set `ECO_AST_PROFILE=1` to emit one structured timing record per client-graph analysis while investigating a development rebuild.

### `explicitGraph` option

`reactPlugin({ explicitGraph: true })` forces the page browser graph (hydration assets) to emit for every React page, even when the page does not declare `dependencies.modules` and no router is configured.

It does **not** disable the client-graph AST boundary. Server-only `eco.page(...)` options such as `middleware` and `requires` are still stripped from browser bundles. With a router adapter, page hydration is already always on, so the option is redundant for SPA apps.

The option name is historical — it forces hydration asset emission, it does not mean “skip graph transforms.”

### What Stays and What Goes

The client bundle keeps:

- The page component render path.
- Client-safe component dependencies reachable from render.
- Layout wiring needed for hydration.
- Router runtime state needed by [@ecopages/react-router](../../react-router/README.md) when SPA mode is enabled.

The client bundle removes or excludes:

- Server-only imports that are not reachable from the hydrated render path.
- Server-only `eco.page(...)` options such as `cache`, `middleware`, `metadata`, `staticProps`, and `staticPaths`.
- Request-time configuration that has no meaning in the browser.

Important:

- `render` must stay in the client bundle, because hydration needs it to reconstruct the page tree.
- `requires` does **not** stay in the browser page config. It is used on the server to decide which `locals` keys may be serialized into the hydration payload.

### AST Pipeline Order

The browser-bound transform in [src/client-graph/boundary-plugin.ts](src/client-graph/boundary-plugin.ts) follows this order:

1. Parse the module and build a reachability view of the client render graph.
2. Remove imports that are not allowed or not reachable from the client graph.
3. Reparse the transformed source.
4. Strip server-only `eco.page(...)` object properties from the reparsed AST.
5. Return the rewritten source to the bundle step.

The reparse step is important. Once import edits change source offsets, the original AST locations are stale. Reusing them for later edits can corrupt the output or remove the wrong code.

### Why `eco.page(...)` Options Are Stripped

Import pruning alone is not enough.

Consider a page like this:

```tsx
import { authMiddleware } from './auth.server';

export default eco.page({
	cache: 'dynamic',
	middleware: [authMiddleware],
	requires: ['session'] as const,
	render: () => <div>Dashboard</div>,
});
```

If the client transform removes the `auth.server` import but leaves `middleware: [authMiddleware]` in place, the browser bundle still contains a dangling identifier. That breaks production hydration even though the import was removed correctly.

The fix is to strip server-only `eco.page(...)` options after import pruning, while keeping `render` intact.

### Hydration Contract for `locals`

The browser must not receive arbitrary request-scoped data.

The React renderer in [src/render/react-renderer.ts](src/render/react-renderer.ts) serializes only the top-level `locals` keys explicitly declared by `Page.requires`. If a page does not declare `requires`, no `locals` are serialized for hydration.

Example:

```tsx
export default eco.page({
	requires: ['session'] as const,
	render: ({ locals }) => <Dashboard user={locals?.session?.user} />,
});
```

In this case, the hydration payload may include `locals.session`, but it will exclude unrelated request-only keys.

Important:

- This filtering is currently top-level only.
- If `locals.session` itself contains sensitive nested fields, those fields will still be serialized.
- Middleware should therefore expose a client-safe shape for any key declared in `requires`.

### Layout Hydration Invariant

Hydration must rebuild the same tree the server rendered.

That applies to both:

- page hydration lifecycle in [src/hydration/browser/page-hydration.ts](src/hydration/browser/page-hydration.ts)
- router-backed hydration in [../../react-router/src/router.ts](../../react-router/src/router.ts)

If the page render receives `locals` on the server and the layout also depends on those values, the client must pass the same serialized `locals` into the layout during hydration. Otherwise React will detect a mismatch.

### Tests That Guard This Contract

The main regression coverage lives in:

- [src/client-graph/boundary-plugin.test.ts](src/client-graph/boundary-plugin.test.ts): verifies server-only `eco.page(...)` options are stripped from browser bundles.
- [src/render/react-renderer.locals.test.ts](src/render/react-renderer.locals.test.ts): verifies only declared `requires` keys are serialized into hydration payloads.
- [src/hydration/hydration-script-compiler.test.ts](src/hydration/hydration-script-compiler.test.ts): verifies editable browser sources compile to readable and minified entries.
- [../../react-router/test/layout-persistence.test.browser.ts](../../react-router/test/layout-persistence.test.browser.ts): verifies router-backed layout hydration receives `locals` with `persistLayouts` both enabled and disabled.

If you change the AST transform or hydration flow, update the corresponding tests in the same change.

### Nested layouts and unified SSR

Pages may declare `layout` as a single component or an **outer → inner** array on `eco.page()`. On the server, React-managed layout stacks compose through `composeDocumentShell` + `composeLayoutPageTree` so provider context reaches nested pages during SSR. On the client, `@ecopages/react-router` `PageContent` uses the same `composeLayoutPageTree` helper unless `persistLayouts` is enabled (then each tier is cached independently).

During SSR, `ReactRenderer` passes the app-resolved React runtime into `composeLayoutPageTree` via `options.react` so layout trees are built with the same module instance the server renders them with. App code should import hooks and context from `react` normally; keep a single React version in the app dependency graph (avoid duplicate `react` copies in monorepos).

Layout prop factories receive `LayoutPropsContext` (`params`, `query`, `locals`). Route-scoped `locals` are passed to layout tiers via document-shell props during SSR; serialized `pageProps.locals` follow `Page.requires` and are intended for the page component.

- [src/render/layout-compose.ts](src/render/layout-compose.ts): shared client/SSR tree builder.
- [src/test/react-ssr-hydration-parity.test.tsx](src/test/react-ssr-hydration-parity.test.tsx): nested tier order parity between SSR and `composeLayoutPageTree`.
- [src/test/react-ssr-unified.test.tsx](src/test/react-ssr-unified.test.tsx): provider context through nested SSR layouts.

### Shared runtime vendors (SPA + persisted layouts)

With `ecoRouter()`, Ecopages keeps outer layout tiers mounted across client navigation (`persistLayouts` defaults to `true`). Each Page chunk still loads separately, while its Layout tiers can stay alive in the DOM.

A package imported by both a persisted Layout and multiple Page chunks must resolve to one browser module instance. Otherwise, a library with module-level state such as React context can be duplicated, and navigation can fail with errors such as `No QueryClient set`.

Register shared packages explicitly with `reactPlugin({ runtimeModules })`. Each listed package is built once into `/assets/vendors/*.js`, and browser graphs import that vendor URL. React, React DOM, and the configured router are already shared. Layout files do not add packages to `runtimeModules` automatically.

In `ecopages dev`, page modules are served from `/assets/__eco_dev__/` and should import `/assets/vendors/*` for shared packages instead of inlining `node_modules`. Kitchen-sink routes `/vendor-share/a` and `/vendor-share/b` (with `runtimeModules: ['zod']`) are the reference fixture; see `playground/kitchen-sink/e2e/shared-vendors.test.e2e.ts`.

#### Register shared packages

List the package specifier that Page or Layout code imports:

```ts
import { defineConfig } from '@ecopages/core/config';
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';

export default defineConfig({
	integrations: [
		reactPlugin({
			router: ecoRouter(),
			runtimeModules: ['@tanstack/react-query'],
		}),
	],
});
```

Use the package root when all imports use that root. Import rewrites match exact specifiers, so add a separate entry for each package subpath used by app code.

**Migration from layout discovery:** remove `runtimeProvider` from layout options. Add each shared package the scanner previously supplied to `runtimeModules` using the exact specifier imported by app code.

`runtimeModules` also accepts objects with a custom vendor output name:

```ts
reactPlugin({
	router: ecoRouter(),
	runtimeModules: ['@tanstack/react-query', { specifier: '@acme/ui', outputName: 'acme-ui' }],
});
```

Each vendor entry is built from the package's browser ESM surface: Ecopages follows an `exports` import target when present and otherwise prefers a package's legacy `module` field over CJS `main`. ESM files are re-exported with `export *`. CJS files (including React's published `index.js` / `jsx-runtime`) emit explicit named exports from that same file so the vendor can provide `jsx`.

Each vendor bundles its package dependencies. Imports whose exact specifiers are registered in `runtimeModules` are rewritten to the corresponding shared vendor URL; React and the configured router are shared automatically.

#### Singleton packages (MobX, Redux, Query client, audio engines)

React context, MobX observables, Redux stores, TanStack Query clients, and audio runtimes (for example Tone.js) depend on one module instance. Register a singleton package in `runtimeModules` when Page and Layout code must share its state.

**Library packaging:** ship singleton dependencies as `peerDependencies` and keep them external in the library build so `dist/` retains `import … from "mobx"` (or equivalent) instead of inlining a private copy.

**Ecopages app config:** register each singleton and library package as its own `runtimeModules` entry. Imports between those vendors are rewritten to the shared vendor URLs when their specifiers match:

```ts
reactPlugin({
	router: ecoRouter(),
	runtimeModules: [
		{ specifier: 'mobx', outputName: 'mobx' },
		{ specifier: 'mobx-react-lite', outputName: 'mobx-react-lite' },
		{ specifier: '@acme/store-ui', outputName: 'acme-store-ui' },
	],
});
```

Registering only the library vendor or only the singleton is not enough when the published library still inlines the singleton. Peer the dependency in the library, externalize it in the library build, and register both the library and singleton specifiers in `runtimeModules`. Existing `externals` fields on runtime module entries should be removed; register each non-framework shared dependency as its own entry. React, React DOM, and the configured router are shared automatically. Rebuild vendors (and clear `.eco` / `dist/assets/vendors` in dev) after changing package entry points or `runtimeModules`.

#### Troubleshooting

| Symptom                                       | Likely cause                                                                                   | Fix                                                                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `No QueryClient set` after SPA navigation     | Query client package is not shared by the Page and Layout graphs                               | Add `@tanstack/react-query` to `runtimeModules` and rebuild vendors                                                                       |
| Duplicate React context / Tone init logs      | Provider package is bundled through multiple client entrypoints                                | Import through the package root and register that root in `runtimeModules`                                                                |
| Store updates / `reaction` / `observer` no-op | Duplicate singleton (for example MobX) — a library inlines one copy and app code loads another | Peer the singleton in the library; register the library and singleton specifiers in `runtimeModules`; rebuild vendors                     |
| `@/` alias not followed                       | Missing or invalid tsconfig paths                                                              | Add `compilerOptions.paths`; ensure `include` globs are valid JSON (not broken by comment stripping)                                      |
| Stale bootstrap script hash in dev            | Rendered HTML cached before runtime vendors/bootstrap scripts changed                          | Rebuild or touch a route file; development HTML cache keys include browser-runtime generation                                             |
| `MISSING_EXPORT` for names like `BasePlugin`  | Vendor listed CJS enumerable keys that the ESM file does not export                            | Register the package root only; rebuild vendors. Subpath plugins are separate module contracts and must be bundled or declared themselves |
| `does not provide an export named 'jsx'`      | Stale React vendor generated with `export *` from CJS `jsx-runtime`                            | Clear `.eco` / `dist/assets/vendors` and rebuild so the CJS entry lists `jsx` / `jsxs` explicitly                                         |
| `Calling require for "/assets/vendors/…"`     | A CJS vendor graph `require()`d another runtime module after URL rewrite                       | Prefer packages with an ESM/`module` entry; register sibling singletons as separate `runtimeModules` entries                              |

Use the dev toolbar **Deps** panel to inspect vendor URLs loaded by the active Page. See [Dev Toolbar](/docs/core/dev-toolbar).

#### Tests

- `src/bundling/runtime-modules.test.ts`: explicit entries, exact package specifiers, and vendor filename normalization.
- `src/bundling/runtime-bundle.test.ts`: vendor registration and manifest paths.
- `../../core/src/assets/asset-processing-service/browser-runtime-entry-resolution.test.ts`: ESM entry resolution and default-export policy for React vs TanStack Query.
- `../../../e2e/fixtures/react-router/persist-layouts.test.e2e.ts`: one QueryClient shared across Page navigation with an explicit `runtimeModules` entry.

### Suspense on the server

Server rendering waits for every `<Suspense>` boundary before it returns HTML, in Pages, Layouts and every other React component they render. A `React.lazy()` component or any other suspending child renders its content into the HTML, not its fallback. Foreign Children inside a suspended subtree resolve as they do anywhere else. The response is still sent as one complete document; it is not streamed. Waiting stops after 10 seconds by default. The limit covers the whole Page render, every React tree in it included: unfinished boundaries stay in their fallback for the browser to retry, the rest of the Page is served, and one warning names the Page. A tree that is still waiting outside every boundary, or whose top level is a boundary, has no HTML to serve, so the render fails instead. React components in a Page of another Integration each get the full limit. Pass `reactPlugin({ renderTimeoutMs: 5_000 })` to change the limit, a whole number of milliseconds from 1 to 2147483647.

React's own error handling applies. A component that throws, or a `React.lazy()` import that rejects, inside a boundary is logged on the server with `console.error`, and that boundary's fallback is served for the browser to retry. The rest of the Page renders normally. An error outside every boundary fails the render.

One case still ships a fallback without an error: React moves a boundary that renders a `<link rel="stylesheet" precedence>` after its fallback, and an inline script swaps the content in. Without JavaScript, or under a CSP that blocks inline scripts, that boundary shows its fallback.

- [src/test/react-ssr-suspense.test.tsx](src/test/react-ssr-suspense.test.tsx): lazy content in Pages, Layouts, Island Hosts and around Foreign Children, concurrent renders, and failing boundaries and shells.

### Client-only code in SSR trees

Wrap browser-only UI in `ClientOnly`:

```tsx
import { eco } from '@ecopages/core';
import { ClientOnly } from '@ecopages/react/utils/client-only';

export const RootLayout = eco.layout({
	render: ({ children }) => (
		<>
			{children}
			<ClientOnly fallback={null}>
				<DevtoolsPanel />
			</ClientOnly>
		</>
	),
});
```

For code-split client-only modules, `import()` inside `useEffect` within `ClientOnly` — not `lazy()`, which loads and renders the module on the server. `dynamic({ ssr: false })` must also stay inside `ClientOnly`; it renders `null` on the server and `lazy()` in the browser.
