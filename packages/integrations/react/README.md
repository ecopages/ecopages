# @ecopages/react

First-class integration for [React 19](https://react.dev/) in Ecopages. This plugin enables React SSR and client hydration, allowing you to build component-level React islands or full React Single Page Applications (SPAs).

## Installation

```bash
bunx jsr add @ecopages/react
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

By default, Ecopages React acts in island mode:

- SSR output preserves the authored DOM structure (no unnecessary wrapper elements).
- A stable `data-eco-component-id` attribute is attached to the component SSR root.
- The client bootstrap mounts the component via `createRoot()` strictly within that root boundary.

> [!TIP]
> **Full React SPA Routing:**
> If you are building full React pages and want client-side navigation (SPA), use [@ecopages/react-router](../react-router/README.md) and pass it to the react plugin: `reactPlugin({ router: ecoRouter() })`.

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
- Router runtime state needed by [@ecopages/react-router](../react-router/README.md) when SPA mode is enabled.

The client bundle removes or excludes:

- Server-only imports that are not reachable from the hydrated render path.
- Server-only `eco.page(...)` options such as `cache`, `middleware`, `metadata`, `staticProps`, and `staticPaths`.
- Request-time configuration that has no meaning in the browser.

Important:

- `render` must stay in the client bundle, because hydration needs it to reconstruct the page tree.
- `requires` does **not** stay in the browser page config. It is used on the server to decide which `locals` keys may be serialized into the hydration payload.

### AST Pipeline Order

The browser-bound transform in [packages/integrations/react/src/utils/client-graph-boundary-plugin.ts](packages/integrations/react/src/utils/client-graph-boundary-plugin.ts) follows this order:

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

The React renderer in [packages/integrations/react/src/react-renderer.ts](packages/integrations/react/src/react-renderer.ts) serializes only the top-level `locals` keys explicitly declared by `Page.requires`. If a page does not declare `requires`, no `locals` are serialized for hydration.

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

- non-router hydration scripts in [packages/integrations/react/src/utils/hydration-scripts.ts](packages/integrations/react/src/utils/hydration-scripts.ts)
- router-backed hydration in [packages/react-router/src/router.ts](packages/react-router/src/router.ts)

If the page render receives `locals` on the server and the layout also depends on those values, the client must pass the same serialized `locals` into the layout during hydration. Otherwise React will detect a mismatch.

### Tests That Guard This Contract

The main regression coverage lives in:

- [packages/integrations/react/src/utils/client-graph-boundary-plugin.test.ts](packages/integrations/react/src/utils/client-graph-boundary-plugin.test.ts): verifies server-only `eco.page(...)` options are stripped from browser bundles.
- [packages/integrations/react/src/react-renderer.locals.test.ts](packages/integrations/react/src/react-renderer.locals.test.ts): verifies only declared `requires` keys are serialized into hydration payloads.
- [packages/integrations/react/src/utils/hydration-scripts.test.ts](packages/integrations/react/src/utils/hydration-scripts.test.ts): verifies non-router hydration passes serialized `locals` into layouts.
- [packages/react-router/test/hmr-reload.test.browser.ts](packages/react-router/test/hmr-reload.test.browser.ts): verifies router-backed layout hydration receives `locals` with `persistLayouts` both enabled and disabled.

If you change the AST transform or hydration flow, update the corresponding tests in the same change.
