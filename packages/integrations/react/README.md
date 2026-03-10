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
