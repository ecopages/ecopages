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
- During non-HMR runtime rendering, island and lazy-entry client modules are built together from the page client plan, in one grouped browser build during route preparation. Static production export contributes React hydration and lazy entries, every Integration's Page Browser Graph entries, and HTML Page and `html.html` shell module scripts to the app-wide browser build. React's client build plugins decide by the module itself, not by the entry that reached it, because a module has one URL and so one compiled form: the MDX loader matches its file extensions and the runtime rewrite matches React's specifiers. The client-graph boundary leaves other Integrations' entry files alone and also processes every other source module of the shared build, so it strips server-only imports from them too. The foreign-JSX override gives React's JSX runtime to a file another JSX Integration owns only when a static import scan from React's island and Page files, run before the build loads any module, reaches it; a foreign file only another Integration's entries reach keeps its owner's runtime, and one that both reach fails the build with the file and both Integrations named. React and other Integrations therefore share one build, and a Layout or package that MDX Pages, TSX Pages and other Integrations' scripts share loads once across client navigation. Hydration scripts import the recorded output URLs. Same-integration Page, Layout, and includes are hydrated by the page bootstrap. The Html shell is not an island, even when its Integration differs from the page owner. Only a React component whose Integration differs from its parent's, on another owner's page, receives a per-component island script. Those scripts join the page's assets during route preparation; SSR only stamps the host and never starts a per-island build.
- Each island component gets its own hydration script, keyed by its component identity. A file that exports several island components is built once and its declared modules are merged, while each component's hosts hydrate the export whose identity matches.
- The island runtime keeps the SSR host and its children in place and hydrates that host with `hydrateRoot()`. The host uses `display: contents` so it does not introduce an extra layout box. Full-page hydration paths also use `hydrateRoot()`.
- Hydration scripts are short generated entries that import the lifecycle from `@ecopages/react/island-hydration` or `@ecopages/react/page-hydration`. Each bootstrap is built once into `/assets/vendors/` like the React runtime. A production Page entry that inlines React bundles `@ecopages/react/page-hydration` instead, and every other entry imports the vendor URL. No server process compiles a bootstrap, so `ecopages start` serves islands from the bundled server.

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

The `.server` naming rule comes from the browser-safe `@ecopages/core/build/contracts` entry. React applies it during import pruning before core's browser resolution guard runs. A Page that uses `.server.ts` imports only in server options such as `middleware`, or in helpers only those options use, still builds: the imports, the options and those helpers are removed before resolution, in every module of the client graph. Other top-level code the browser does not need that uses a stripped import is removed too. A stripped import that code the browser needs still uses fails the build and names the binding, its specifier and its `file:line:column`; see [AST Pipeline Order](#ast-pipeline-order).

For a hydratable Page that renders collection MDX, call `createLazyCollectionComponents()` from `@ecopages/react/lazy-collection-components` once at module level with the collection's `/component` loader. Its `get(slug)` returns one `React.lazy` component per slug, so the Page reads `const Content = posts.get(entry.slug)` and renders `<Content />` inside a `<Suspense>` boundary. The server waits for the entry and sends it in the HTML, hydration keeps that HTML until the browser has loaded the entry, and `dependencies` stays server-only and is removed from the Page Browser Graph. Keep the boundary at a fixed place in the Page, not keyed by slug: when a client navigation moves to another entry, React then leaves the current Page on screen until the next entry has loaded instead of showing the fallback. When the browser cannot load an entry during a client navigation (a replaced chunk, a dropped connection), `@ecopages/react-router` falls back to a full navigation to that URL. The helper keeps one lookup per collection outside the Page module. In development, HMR of the Page module therefore renders the already-loaded entry again without the Suspense fallback; the Page's own DOM is still replaced, because the reloaded Page is a new component. An edited MDX file re-renders that entry in place without a document reload. On the server, a reloaded server module graph starts a new lookup.

A load that fails while the first Page hydrates is not retried. React tears the Page root down, and the server HTML is put back, so the Page stays readable but is no longer interactive. Nodes that other scripts added to the body stay, and in development the next edit to the Page reloads the document. The same happens for any uncaught error on the first-loaded Page, such as a lazy modal chunk that fails later, until the Page re-renders or the router has navigated; after a client navigation the router turns a Page render error into a full navigation instead. A Page-level error boundary around the entry catches the error first: the rest of the Page stays and the boundary fallback is shown. Those outcomes are the same with and without the router. The Playwright specs below run against `ecopages dev`, where the lazy import is a separate request.

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

The browser-bound transform in [src/client-graph/boundary-plugin.ts](src/client-graph/boundary-plugin.ts) runs on every module of the client graph, not only on Page and Layout entries, and plans all of its edits on one parse of the module:

1. Build a reachability view of the client render graph.
2. Remove imports that are not allowed: Node built-ins, `.server` modules, `ecopages:content/*/server` modules and named imports outside the declared `pkg{name}` rules. An import reachable from a client root fails the build instead.
3. Remove server-only `eco.page(...)` options.
4. Work out which top-level code the browser module needs: every top-level statement that is not a declaration (the default export included), declarations that create a client root such as `eco.component(...)`, the named exports browser importers are known to request, and every declaration those reach. In a module that calls `eco.page(...)`, the legacy `getMetadata`, `getStaticProps` and `getStaticPaths` exports are never needed by themselves.
5. Remove each declaration the browser module does not need when only removed code used it, or when it uses a removed import or another removed declaration, repeating until nothing else changes. An exported name keeps its binding, set to `undefined`. Imports only removed code used are removed too, so their modules stay out of the browser graph.
6. Fail the build when needed code, or an `export { ... }` list, still uses a binding whose import step 2 removed.
7. Apply the edits and return the rewritten source to the bundle step.

A named export nothing requests is not needed, because rolldown would tree-shake it anyway, and requests are unknown for imports through a path alias such as `@/utils/mixed-utils`. So a helper module can keep `export function dbSecretQuery() { return readFileSync(...) }` next to the `formatDate` a Page renders: in the browser, `dbSecretQuery` is `undefined` and `node:fs` is gone.

Step 5 does not look at side effects. A declaration such as `const registered = register('x')` that only server-only options use is removed with its call. Code that must run in the browser for its effect, such as `customElements.define(...)`, belongs in a top-level statement of its own, which always stays.

The analysis is scope-aware ([src/client-graph/scope-walk.ts](src/client-graph/scope-walk.ts)). A parameter, local or destructured binding that shadows an import name is not a use of the import, and neither is a property key or a class member name. A parameter default sees the parameters but not the function body's declarations. Type positions and the bare operand of `typeof` are not uses. The operand of `as`, `satisfies` and `!` is a use, as is code in enums and namespaces. A JSX element name such as `<Secret />` is a use.

### Why `eco.page(...)` Options Are Stripped

Import pruning alone is not enough.

Consider a page like this:

```tsx
import { authMiddleware } from './auth.server';
import { getPost } from './posts.server';

const staticProps = async () => ({ props: { post: await getPost() } });

export default eco.page({
	cache: 'dynamic',
	middleware: [authMiddleware],
	requires: ['session'] as const,
	staticProps,
	render: () => <div>Dashboard</div>,
});
```

If the client transform removed the `auth.server` import but left `middleware: [authMiddleware]` in place, the browser bundle would contain a dangling identifier and throw a `ReferenceError` when it loads. The boundary therefore strips the server-only options, then the `staticProps` helper they alone used, while keeping `render` intact.

A stripped import still used by code the browser module needs fails the build with its `file:line:column`:

```text
[Ecopages Client Graph] 'authMiddleware' (imported from './auth.server') is used at src/widget.tsx:2:22, but that import is server-only and the browser build removes it. ...
```

Move that code into a server-only Page option, into a helper only those options use, or out of the code the browser module reaches.

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
- [src/hydration/hydration-entry-source.test.ts](src/hydration/hydration-entry-source.test.ts): a generated island entry registers, and a generated Page entry hydrates, through the bootstrap module it imports.
- [../../../e2e/fixtures/react-production-start/react-production-start.test.e2e.ts](../../../e2e/fixtures/react-production-start/react-production-start.test.e2e.ts): a built app serves a static and a dynamic Page under `ecopages start`, and their React island hydrates.
- [../../react-router/test/layout-persistence.test.browser.ts](../../react-router/test/layout-persistence.test.browser.ts): verifies router-backed layout hydration receives `locals` with `persistLayouts` both enabled and disabled.
- [src/hydration/hydration-lifecycle.test.browser.ts](src/hydration/hydration-lifecycle.test.browser.ts): an uncaught `React.lazy` rejection during first hydration restores the server HTML, keeps body nodes added after mount, drops the page root and makes the next HMR update reload; a Page-level error boundary around the entry still shows its fallback.
- [../../../playground/kitchen-sink/e2e/content-lazy.test.e2e.ts](../../../playground/kitchen-sink/e2e/content-lazy.test.e2e.ts): a collection chunk that fails during first hydration restores the server HTML (including the playground shell) and is not retried. A Page-level error boundary around the entry keeps the rest of the Page and shows the boundary fallback.
- [../../../e2e/fixtures/react-lazy-first-load/lazy-first-load.test.e2e.ts](../../../e2e/fixtures/react-lazy-first-load/lazy-first-load.test.e2e.ts): the same first-hydration outcomes for a React Page without the router.
- [src/content/lazy-collection-components.test.tsx](src/content/lazy-collection-components.test.tsx): in the browser a new loader for the same collection keeps loaded lazy types and renders an edited entry under the same type; on the server a new loader starts a new lookup.
- [../../../playground/kitchen-sink/e2e/content-hmr.test.e2e.ts](../../../playground/kitchen-sink/e2e/content-hmr.test.e2e.ts): HMR of a collection Page renders the entry through the same resolved lazy type without the Suspense fallback. An edited MDX file still updates without a document reload.

If you change the AST transform or hydration flow, update the corresponding tests in the same change.

### Nested layouts and unified SSR

Pages may declare `layout` as a single component or an **outer → inner** array on `eco.page()`. On the server, React-managed layout stacks compose through `composeDocumentShell` + `composeLayoutPageTree` so provider context reaches nested pages during SSR. On the client, `@ecopages/react-router` `PageContent` uses the same `composeLayoutPageTree` helper; a tier stays mounted while consecutive pages pass the same layout function.

A server render tracks which tiers and the page it reached (`LayoutRenderTracker`): a layout that renders without its page is reported through the renderer's render-mode handler (`Layout <name> (<file>) did not render its children`), which throws for static build output, warns in development and stays silent in production. Each tier is wrapped in a function that calls it directly, so the tree keeps its depth and `useId` values match the browser's.

During SSR, `ReactRenderer` passes the app-resolved React runtime into `composeLayoutPageTree` via `options.react` so layout trees are built with the same module instance the server renders them with. App code should import hooks and context from `react` normally; keep a single React version in the app dependency graph (avoid duplicate `react` copies in monorepos).

Layout prop factories receive `LayoutPropsContext` (`params`, `query`, `locals`). Route-scoped `locals` are passed to layout tiers via document-shell props during SSR; serialized `pageProps.locals` follow `Page.requires` and are intended for the page component.

- [src/render/layout-compose.ts](src/render/layout-compose.ts): shared client/SSR tree builder.
- [src/test/react-ssr-hydration-parity.test.tsx](src/test/react-ssr-hydration-parity.test.tsx): nested tier order parity between SSR and `composeLayoutPageTree`.
- [src/test/react-ssr-unified.test.tsx](src/test/react-ssr-unified.test.tsx): provider context through nested SSR layouts.

### Shared browser modules (SPA + persisted layouts)

With `ecoRouter()`, Ecopages keeps outer layout tiers mounted across client navigation (`persistLayouts` defaults to `true`). Each Page chunk still loads separately, while its Layout tiers can stay alive in the DOM.

A package imported by both a persisted Layout and several Pages must be one browser module instance. Otherwise a library with module-level state, such as a React context, MobX store or TanStack Query client, is duplicated and navigation fails with errors such as `No QueryClient set`. Ecopages guarantees one instance without configuration:

- Production builds every browser entry of the app in one build with code splitting, so a package that several Pages, Layouts or islands import is one chunk with one URL. See the build README for the options that still separate entries.
- `ecopages dev` serves Page modules from `/assets/__eco_dev__/` and every bare import from a vendor URL under `/assets/vendors/`, one per resolved package entry, so every importer shares it.

React, React DOM, `layout-compose` and the configured router are browser runtime assets with fixed URLs under `/assets/vendors/`; imports of those specifiers are rewritten to those URLs in every build.

Each runtime asset is built from the package's browser ESM surface: Ecopages follows an `exports` import target when present and otherwise prefers a package's legacy `module` field over CJS `main`. ESM files are re-exported with `export *`. CJS files (including React's published `index.js` / `jsx-runtime`) emit explicit named exports from that same file so the vendor can provide `jsx`.

**Library packaging:** a library that depends on a singleton such as MobX should declare it as a `peerDependency` and keep it external in its own build, so its `dist/` keeps `import … from "mobx"` instead of inlining a private copy that the app's copy cannot see.

Kitchen-sink routes `/vendor-share/a` and `/vendor-share/b` are the reference fixture for one shared package across navigation; see `playground/kitchen-sink/e2e/shared-vendors.test.e2e.ts`.

#### Troubleshooting

| Symptom                                       | Likely cause                                                                                   | Fix                                                                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Store updates / `reaction` / `observer` no-op | Duplicate singleton (for example MobX) — a library inlines one copy and app code loads another | Peer the singleton in the library and keep it external in the library build                              |
| `@/` alias not followed                       | Missing or invalid tsconfig paths                                                              | Add `compilerOptions.paths`; ensure `include` globs are valid JSON (not broken by comment stripping)     |
| Stale bootstrap script hash in dev            | Rendered HTML cached before runtime vendors/bootstrap scripts changed                          | Rebuild or touch a route file; development HTML cache keys include browser-runtime generation            |
| `does not provide an export named 'jsx'`      | Stale React vendor generated with `export *` from CJS `jsx-runtime`                            | Clear `.eco` / `dist/client/assets/vendors` and rebuild so the CJS entry lists `jsx` / `jsxs` explicitly |

Use the dev toolbar **Deps** panel to inspect vendor URLs loaded by the active Page. See [Dev Toolbar](/docs/core/dev-toolbar).

#### Tests

- `src/bundling/runtime-bundle.test.ts`: runtime asset registration and manifest paths.
- `../../core/src/assets/asset-processing-service/browser-runtime-entry-resolution.test.ts`: ESM entry resolution and default-export policy for React vs TanStack Query.
- `../../../e2e/fixtures/react-router/persist-layouts.test.e2e.ts`: one QueryClient shared across Page navigation, without configuration.
- `../../../e2e/fixtures/react-router/layout-persistence.e2e-shared.ts`: in dev and preview, a plain Layout and an `eco.layout()` Layout keep their React state across navigation, and one Layout module is evaluated once across MDX and TSX Pages.

### Suspense on the server

Server rendering waits for every `<Suspense>` boundary before it returns HTML, in Pages, Layouts and every other React component they render. A `React.lazy()` component or any other suspending child renders its content into the HTML, not its fallback. Foreign Children inside a suspended subtree resolve as they do anywhere else. The response is still sent as one complete document; it is not streamed. Waiting stops after 10 seconds by default. The limit covers the whole Page render, every React tree in it included: unfinished boundaries stay in their fallback for the browser to retry, the rest of the Page is served, and one warning names the Page. A tree that is still waiting outside every boundary has no HTML to serve, so the render fails instead. React components in a Page of another Integration each get the full limit. Pass `reactPlugin({ renderTimeoutMs: 5_000 })` to change the limit, a whole number of milliseconds from 1 to 2147483647.

React's own error handling applies. A component that throws, or a `React.lazy()` import that rejects, inside a boundary is logged on the server with `console.error`, and that boundary's fallback is served for the browser to retry. The rest of the Page renders normally. An error outside every boundary fails the render.

A boundary that renders a `<link rel="stylesheet" precedence>` also fails the render: React moves that content after its fallback and reveals it with an inline script. Declare the stylesheet as a Dependency instead.

- [src/test/react-ssr-suspense.test.tsx](src/test/react-ssr-suspense.test.tsx): lazy content in Pages, Layouts, Island Hosts and around Foreign Children, concurrent renders, failing boundaries and shells, the render time limit, and a precedence stylesheet that fails the render.

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
