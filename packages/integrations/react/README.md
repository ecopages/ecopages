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
- A stable `data-eco-component-id` attribute is attached to the component SSR root.
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

The browser-bound transform in [src/utils/client-graph-boundary-plugin.ts](src/utils/client-graph-boundary-plugin.ts) follows this order:

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

The React renderer in [src/react-renderer.ts](src/react-renderer.ts) serializes only the top-level `locals` keys explicitly declared by `Page.requires`. If a page does not declare `requires`, no `locals` are serialized for hydration.

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

- non-router hydration scripts in [src/utils/hydration-scripts.ts](src/utils/hydration-scripts.ts)
- router-backed hydration in [../../react-router/src/router.ts](../../react-router/src/router.ts)

If the page render receives `locals` on the server and the layout also depends on those values, the client must pass the same serialized `locals` into the layout during hydration. Otherwise React will detect a mismatch.

### Tests That Guard This Contract

The main regression coverage lives in:

- [src/utils/client-graph-boundary-plugin.test.ts](src/utils/client-graph-boundary-plugin.test.ts): verifies server-only `eco.page(...)` options are stripped from browser bundles.
- [src/react-renderer.locals.test.ts](src/react-renderer.locals.test.ts): verifies only declared `requires` keys are serialized into hydration payloads.
- [src/utils/hydration-scripts.test.ts](src/utils/hydration-scripts.test.ts): verifies non-router hydration passes serialized `locals` into layouts.
- [../../react-router/test/hmr-reload.test.browser.ts](../../react-router/test/hmr-reload.test.browser.ts): verifies router-backed layout hydration receives `locals` with `persistLayouts` both enabled and disabled.

If you change the AST transform or hydration flow, update the corresponding tests in the same change.

### Nested layouts and unified SSR

Pages may declare `layout` as a single component or an **outer → inner** array on `eco.page()`. On the server, React-managed layout stacks compose through `composeDocumentShell` + `composeLayoutPageTree` so provider context reaches nested pages during SSR. On the client, `@ecopages/react-router` `PageContent` uses the same `composeLayoutPageTree` helper unless `persistLayouts` is enabled (then each tier is cached independently).

During SSR, `ReactRenderer` passes the app-resolved React runtime into `composeLayoutPageTree` via `options.react` so layout trees are built with the same module instance as `renderToString`. App code should import hooks and context from `react` normally; keep a single React version in the app dependency graph (avoid duplicate `react` copies in monorepos).

Layout prop factories receive `LayoutPropsContext` (`params`, `query`, `locals`). Route-scoped `locals` are passed to layout tiers via document-shell props during SSR; serialized `pageProps.locals` follow `Page.requires` and are intended for the page component.

- [src/layout-compose.ts](src/layout-compose.ts): shared client/SSR tree builder.
- [src/test/react-ssr-hydration-parity.test.tsx](src/test/react-ssr-hydration-parity.test.tsx): nested tier order parity between SSR and `composeLayoutPageTree`.
- [src/test/react-ssr-unified.test.tsx](src/test/react-ssr-unified.test.tsx): provider context through nested SSR layouts.

### Shared runtime vendors (SPA + persisted layouts)

When `reactPlugin({ router: ecoRouter() })` is enabled, Ecopages registers selected npm packages as **shared browser runtime vendors** alongside React and React DOM. Each page chunk imports those packages through the same public vendor URL instead of bundling a private copy.

This matters when `@ecopages/react-router` keeps layout tiers mounted across navigation (`persistLayouts` defaults to `true` with `ecoRouter()`). If a context provider library such as TanStack Query is bundled separately into every page chunk, React context breaks on client navigation (`No QueryClient set`, duplicate React runtimes, etc.).

#### When auto-discovery runs

Auto-discovery runs at plugin setup when **both** are true:

- `router` is passed to `reactPlugin()`
- The app config exposes `absolutePaths.projectDir`, `layoutsDir`, and `componentsDir`

Without `router`, only explicit `runtimeModules` entries are vendored.

#### What gets discovered

1. Scan **`layoutsDir` and `componentsDir`** for source files whose contents include `eco.layout(`.
2. From each layout's **`render` client graph** (via reachability analysis), follow relative imports and tsconfig path aliases.
3. Collect **npm package roots** reachable from that graph (for example `@tanstack/react-query`, not `@tanstack/react-query/devtools`).
4. Register each discovered package as a shared vendor. React, React DOM, the router bundle, and `@ecopages/*` packages are excluded automatically.

Important:

- Discovery is **reachability-based**. Imports not reachable from the layout `render` path are ignored.
- Discovery is **not limited to context providers**. Any npm package in the layout render graph may be vendored.
- Layout files outside the configured `layouts/` and `components/` directories are not scanned.

Path aliases resolve from the app `tsconfig.json` `compilerOptions.paths` (via oxc-resolver), same as the Ecopages alias resolver plugin. Relative imports work without tsconfig aliases.

#### Configuration

Normal SPA setup — no manual vendor list required when providers live in scanned layout trees:

```ts
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { reactPlugin } from '@ecopages/react';
import { ecoRouter } from '@ecopages/react-router';

const config = await new ConfigBuilder().setIntegrations([reactPlugin({ router: ecoRouter() })]).build();

export default config;
```

Layout with a shared provider (tsconfig alias example):

```tsx
import { eco } from '@ecopages/core';
import { QueryProvider } from '@/shared/query/query-provider';

export const QueryRootLayout = eco.layout({
	render: ({ children }) => <QueryProvider>{children}</QueryProvider>,
});
```

Requires matching tsconfig paths, for example:

```json
{
	"compilerOptions": {
		"paths": {
			"@/*": ["./src/*"]
		}
	}
}
```

Override when discovery misses a package, or when `router` is not enabled:

```ts
reactPlugin({
	router: ecoRouter(),
	runtimeModules: ['@tanstack/react-query', { specifier: '@acme/ui', outputName: 'acme-ui', externals: ['react'] }],
});
```

Manual `runtimeModules` entries **override** auto-discovered entries for the same specifier.

- [src/utils/discover-layout-runtime-modules.test.ts](src/utils/discover-layout-runtime-modules.test.ts): layout graph discovery and tsconfig alias following.
- [src/services/react-runtime-bundle.service.test.ts](src/services/react-runtime-bundle.service.test.ts): configured runtime modules registered as shared vendors.

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
