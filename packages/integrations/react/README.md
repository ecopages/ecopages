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
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { reactPlugin } from '@ecopages/react';

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([reactPlugin()])
	.build();

export default config;
```

## Component-Level Islands

For component-level islands, Ecopages React uses this contract:

- SSR output preserves the authored DOM structure (no unnecessary wrapper elements).
- A stable island host contract is stamped on the component SSR root via core (`data-eco-island`, `data-eco-island-integration`, `data-eco-component-id`, optional `data-eco-component-key` / `data-eco-props`).
- The island runtime replaces the SSR host with a dedicated client-owned container and mounts it with `createRoot()`. Full-page hydration paths use `hydrateRoot()`.

> [!TIP]
> **Full React SPA Routing:**
> If you are building full React pages and want client-side navigation (SPA), use [@ecopages/react-router](../../react-router/README.md) and pass it to the react plugin: `reactPlugin({ router: ecoRouter() })`.

## MDX Support

The React plugin includes built-in MDX support. When enabled, you can write `.mdx` pages alongside `.tsx` pages with unified client-side routing, hydration, and HMR.

```ts
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { reactPlugin } from '@ecopages/react';

const config = await new ConfigBuilder()
	.setIntegrations([
		reactPlugin({
			mdx: {
				enabled: true,
				compilerOptions: {
					// Optional: remark/rehype plugins
				},
			},
		}),
	])
	.build();

export default config;
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
- React still keeps its own child transport and hydration rules for React-owned subtrees.

## Server and Client Graph Contract

The React integration supports Node.js modules and server-only code **only on the server execution graph**.

- Server rendering can safely import `node:*` modules, database clients, filesystem utilities, etc.
- Client-hydrated React code must resolve to browser-safe modules only.
- If a server-only import crosses the boundary and becomes reachable by client code, **the client build will intentionally fail**.

Keep server helpers close, but separate them physically or logically so they do not leak into the client bundle.

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

The boundary cache is owned by the React plugin and shared by normal Page Browser Graph bundles and HMR. Cache entries include the module source, allow-list package names with their permitted exports, and inbound requested exports; each build still starts with a fresh requested-export registry. Modules that inline external file contents are never cached. Set `ECO_AST_PROFILE=1` to emit one structured timing record per client-graph cache lookup and analysis while investigating a docs build or development rebuild.

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

- non-router hydration scripts in [src/hydration/hydration-scripts.ts](src/hydration/hydration-scripts.ts)
- router-backed hydration in [../../react-router/src/router.ts](../../react-router/src/router.ts)

If the page render receives `locals` on the server and the layout also depends on those values, the client must pass the same serialized `locals` into the layout during hydration. Otherwise React will detect a mismatch.

### Tests That Guard This Contract

The main regression coverage lives in:

- [src/client-graph/boundary-plugin.test.ts](src/client-graph/boundary-plugin.test.ts): verifies server-only `eco.page(...)` options are stripped from browser bundles.
- [src/render/react-renderer.locals.test.ts](src/render/react-renderer.locals.test.ts): verifies only declared `requires` keys are serialized into hydration payloads.
- [src/hydration/hydration-scripts.test.ts](src/hydration/hydration-scripts.test.ts): verifies non-router hydration passes serialized `locals` into layouts.
- [../../react-router/test/hmr-reload.test.browser.ts](../../react-router/test/hmr-reload.test.browser.ts): verifies router-backed layout hydration receives `locals` with `persistLayouts` both enabled and disabled.

If you change the AST transform or hydration flow, update the corresponding tests in the same change.

### Nested layouts and unified SSR

Pages may declare `layout` as a single component or an **outer → inner** array on `eco.page()`. On the server, React-managed layout stacks compose through `composeDocumentShell` + `composeLayoutPageTree` so provider context reaches nested pages during SSR. On the client, `@ecopages/react-router` `PageContent` uses the same `composeLayoutPageTree` helper unless `persistLayouts` is enabled (then each tier is cached independently).

During SSR, `ReactRenderer` passes the app-resolved React runtime into `composeLayoutPageTree` via `options.react` so layout trees are built with the same module instance as `renderToString`. App code should import hooks and context from `react` normally; keep a single React version in the app dependency graph (avoid duplicate `react` copies in monorepos).

Layout prop factories receive `LayoutPropsContext` (`params`, `query`, `locals`). Route-scoped `locals` are passed to layout tiers via document-shell props during SSR; serialized `pageProps.locals` follow `Page.requires` and are intended for the page component.

- [src/render/layout-compose.ts](src/render/layout-compose.ts): shared client/SSR tree builder.
- [src/test/react-ssr-hydration-parity.test.tsx](src/test/react-ssr-hydration-parity.test.tsx): nested tier order parity between SSR and `composeLayoutPageTree`.
- [src/test/react-ssr-unified.test.tsx](src/test/react-ssr-unified.test.tsx): provider context through nested SSR layouts.

### Shared runtime vendors (SPA + persisted layouts)

#### Mental model

With `ecoRouter()`, Ecopages keeps outer layout tiers mounted across client navigation (`persistLayouts` defaults to `true`). Each page chunk still loads separately, but provider layouts stay alive in the DOM.

That creates a module identity problem: if TanStack Query (or any shared provider library) is bundled into every page chunk separately, each chunk gets its own copy of the library and its own React context. Navigation then breaks with errors such as `No QueryClient set`, even though the provider component is still mounted.

The fix is **shared browser runtime vendors**: selected npm packages are built once into `/assets/vendors/*.js` and every page chunk imports the same public URL. React, React DOM, the router bundle, and auto-discovered layout runtime packages all follow this path.

In `ecopages dev`, page modules are served from `/assets/__eco_dev__/` and should import `/assets/vendors/*` for shared packages instead of inlining `node_modules`. Kitchen-sink routes `/vendor-share/a` and `/vendor-share/b` (with `runtimeModules: ['zod']`) are the reference fixture; see `playground/kitchen-sink/e2e/shared-vendors.test.e2e.ts`.

The Ecopages dev toolbar **Islands** app inspects `data-eco-island`, `data-eco-component-id`, `data-eco-props`, and `window.__ECO_PAGES__.islandRoots` during development.

Auto-discovery removes the need to hand-maintain `runtimeModules` for the common case — a query-client layout that imports `@tanstack/react-query` is enough when discovery is configured correctly.

#### When auto-discovery runs

Auto-discovery runs at plugin setup when **both** are true:

- `router` is passed to `reactPlugin()`
- The app config exposes `absolutePaths.projectDir`, `layoutsDir`, and `componentsDir`

Without `router`, only explicit `runtimeModules` entries are vendored.

Semantic `404.*` / `500.*` templates render outside the page-request middleware pipeline. Do not use `cache: 'dynamic'`, `middleware`, or `requires` on those files; they receive safe empty `pageLocals` instead of request-scoped locals.

#### Discovery modes

| Mode                               | Trigger                                          | Layout roots scanned                                       | npm packages collected                                      |
| ---------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------- |
| **Runtime-provider** (recommended) | At least one layout sets `runtimeProvider: true` | Only flagged layouts                                       | Every reachable npm package in that layout's `render` graph |
| **Provider-scoped fallback**       | No layout sets `runtimeProvider: true`           | All `eco.layout(` files under `layouts/` and `components/` | npm packages imported from provider/context modules only    |

The fallback exists for backward compatibility. Ecopages logs a debug message when fallback mode is active. Prefer explicit `runtimeProvider: true` on provider root layouts (for example a query-client tier) and omit it from shell-only layouts.

#### What gets discovered

1. Select layout entry files using the mode above.
2. From each root layout's **`render` client graph** (reachability analysis), follow relative imports and tsconfig path aliases. Type-only imports, side-effect-only imports (for example `import "mobx"`), and `.server.ts` modules are skipped.
3. Collect npm package roots (for example `@tanstack/react-query`, not `@tanstack/react-query/devtools`).
4. Register each discovered package as a shared vendor.

**Excluded automatically:** React, React DOM, jsx runtimes, the router bundle, `@ecopages/*`, workspace packages under `@techn.es/*`, `*-devtools` packages, and packages already vendored by the React plugin.

Path aliases resolve from `tsconfig.json` `compilerOptions.paths` (oxc-resolver), same as the Ecopages alias resolver plugin.

#### Recommended setup

Plugin config — no manual vendor list when provider layouts are flagged:

```ts
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';

const config = await new ConfigBuilder().setIntegrations([reactPlugin({ router: ecoRouter() })]).build();

export default config;
```

Provider root layout — set `runtimeProvider: true` on the tier that mounts shared client state:

```tsx
import type { ReactNode } from 'react';
import { eco } from '@ecopages/core';
import { QueryProvider } from '@/shared/query/query-provider';

export const QueryRootLayout = eco.layout<ReactNode>({
	runtimeProvider: true,
	render: ({ children }) => <QueryProvider>{children}</QueryProvider>,
});
```

Shell layouts that do not mount shared runtime state omit the flag:

```tsx
export const AppShellLayout = eco.layout({
	render: ({ children }) => <AppShell>{children}</AppShell>,
});
```

Stack provider roots before shell tiers in page `layout` arrays so context wraps the shell on both SSR and persisted client navigation.

Requires matching tsconfig paths when using aliases:

```json
{
	"compilerOptions": {
		"paths": {
			"@/*": ["./src/*"]
		}
	}
}
```

#### Overrides and escape hatches

Use explicit `runtimeModules` when discovery misses a package, when `router` is not enabled, or when you need custom vendor output names or externals:

```ts
reactPlugin({
	router: ecoRouter(),
	runtimeModules: ['@tanstack/react-query', { specifier: '@acme/ui', outputName: 'acme-ui', externals: ['react'] }],
});
```

Manual entries **override** auto-discovered entries for the same specifier. Discovery normalizes package subpaths to package roots; import rewrite matches **exact** specifiers registered in `runtimeModules`.

Each vendor entry is built from the package's browser ESM surface: Ecopages follows an `exports` import target when present and otherwise prefers a package's legacy `module` field over CJS `main`. ESM files are re-exported with `export *`. CJS files (including React's published `index.js` / `jsx-runtime`) emit explicit named exports from that same file so the vendor can provide `jsx`. Keep `runtimeModules` at package roots. A package subpath is a separate module contract and must either be registered explicitly or bundled with the consuming page/library.

`externals` on a library vendor must already be shared vendors (React, the router bundle, or another `runtimeModules` specifier). Unmapped externals throw at plugin setup instead of emitting a bare specifier the browser cannot resolve.

#### Singleton packages (MobX, Redux, Query client, audio engines)

Some npm packages must exist as **one browser module** across layout vendors, page chunks, and dev lazy prebundles. React context, MobX observables, Redux stores, TanStack Query clients, and audio runtimes (for example Tone.js) all break when two copies load.

Layout auto-discovery only walks `eco.layout()` render graphs. Page-level imports of a singleton that is not registered in `runtimeModules` may be lazily prebundled into a **second** vendor in dev, or inlined into page chunks in production. If a shared library vendor also bundles that singleton internally, you get duplicate instances even though both sides "import the same package name."

**Library packaging:** ship singleton deps as `peerDependencies` and keep them external in the library build so `dist/` retains `import … from "mobx"` (or equivalent) instead of inlining a private copy.

**Ecopages app config:** register each singleton as its own `runtimeModules` entry and list it in `externals` on any library vendor that imports it:

```ts
reactPlugin({
	router: ecoRouter(),
	runtimeModules: [
		{ specifier: 'mobx', outputName: 'mobx' },
		{ specifier: 'mobx-react-lite', outputName: 'mobx-react-lite' },
		{
			specifier: '@acme/store-ui',
			outputName: 'acme-store-ui',
			externals: ['mobx', 'mobx-react-lite', 'react', 'react-dom'],
		},
	],
});
```

Registering only the library vendor, or only the singleton, is not enough when the published library still inlines the singleton. Rebuild vendors (and clear `.eco` / `dist/assets/vendors` in dev) after changing package entry points or `runtimeModules`.

#### Troubleshooting

| Symptom                                       | Likely cause                                                                                                 | Fix                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `No QueryClient set` after SPA navigation     | Provider library bundled per page chunk                                                                      | Ensure `router` is enabled; add `runtimeProvider: true` on the provider layout; rebuild vendors                                        |
| Duplicate React context / Tone init logs      | Provider package is bundled through multiple client entrypoints                                              | Import through the package root and register that root in `runtimeModules`                                                             |
| Store updates / `reaction` / `observer` no-op | Duplicate singleton (for example MobX) — layout vendor inlines one copy, page or dev prebundle loads another | Peer the singleton in the library; add explicit `runtimeModules` for it; list it in `externals` on the library vendor; rebuild vendors |
| Wrong packages vendored (slow dev startup)    | Shell layout scanned as discovery root                                                                       | Set `runtimeProvider: true` only on provider roots; keep shell layouts unflagged                                                       |
| Package not discovered                        | Layout outside `layouts/` / `components/`, or import not reachable from `render`                             | Move layout file or add explicit `runtimeModules` entry                                                                                |
| `@/` alias not followed                       | Missing or invalid tsconfig paths                                                                            | Add `compilerOptions.paths`; ensure `include` globs are valid JSON (not broken by comment stripping)                                   |
| Stale bootstrap script hash in dev            | Rendered HTML cached before runtime vendors/bootstrap scripts changed                                        | Rebuild or touch a route file; development HTML cache keys include browser-runtime generation                                          |
| `MISSING_EXPORT` for names like `BasePlugin`  | Vendor listed CJS enumerable keys that the ESM file does not export                                          | Register the package root only; rebuild vendors. Subpath plugins are a separate module and must be bundled or declared themselves     |
| `does not provide an export named 'jsx'`      | Stale React vendor generated with `export *` from CJS `jsx-runtime`                                          | Clear `.eco` / `dist/assets/vendors` and rebuild so the CJS entry lists `jsx` / `jsxs` explicitly                                      |
| `Calling require for "/assets/vendors/…"`     | A CJS vendor graph `require()`d another runtime module after URL rewrite                                     | Prefer packages with an ESM/`module` entry; keep sibling singletons as `runtimeModules` + `externals`                                  |

#### Tests

- [src/bundling/discover-layout-runtime-modules.test.ts](src/bundling/discover-layout-runtime-modules.test.ts): discovery modes, provider scoping, tsconfig aliases, stacked layouts.
- [src/bundling/runtime-bundle.test.ts](src/bundling/runtime-bundle.test.ts): vendor registration and manifest paths.
- [../../core/src/services/assets/asset-processing-service/browser-runtime-entry-resolution.test.ts](../../core/src/services/assets/asset-processing-service/browser-runtime-entry-resolution.test.ts): ESM entry resolution and default-export policy for React vs TanStack Query.

### Client-only code in SSR trees

Pages and layouts SSR through `renderToString`, which does not support `<Suspense>`. Do not use `React.lazy()` + `<Suspense>` in `eco.page()` or `eco.layout()` trees.

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

For code-split client-only modules, `import()` inside `useEffect` within `ClientOnly` — not `lazy()`. `dynamic({ ssr: false })` must also stay inside `ClientOnly`; it renders `null` on the server and `lazy()` in the browser.
