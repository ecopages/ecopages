# Ecopages React Integration Plugin

The `@ecopages/react` package introduces first-class integration with [React](https://reactjs.org/) version 19, enabling developers to leverage React's robust ecosystem and component model within the Ecopages platform. This integration provides a seamless experience for using React components in your Ecopages projects, combining React's declarative UI library with the flexibility and simplicity of Ecopages.

## Install

```bash
bunx jsr add @ecopages/react
```

## Usage

To incorporate the React integration into your Ecopages project, configure your project as follows:

```ts
import { ConfigBuilder } from '@ecopages/core';
import { reactPlugin } from '@ecopages/react';

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([reactPlugin()])
	.build();

export default config;
```

## MDX Support

The React plugin includes optional MDX support. When enabled, you can write `.mdx` pages alongside `.tsx` pages with unified client-side routing, hydration, and HMR.

```ts
import { ConfigBuilder } from '@ecopages/core';
import { reactPlugin } from '@ecopages/react';

const config = await new ConfigBuilder()
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
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

This approach is recommended when using a client-side router (e.g., `@ecopages/react-router`) as it ensures consistent navigation between TSX and MDX pages.

## Component-Level Islands

Current behavior:

- SSR output keeps the authored component DOM structure (no synthetic wrapper element).
- A stable `data-eco-component-id` attribute is attached to the component SSR root when a single root element is available.
- Client bootstrap resolves the component export and mounts with `createRoot()` into that root boundary.
- Component assets are emitted through the shared dependency pipeline and deduplicated with other integrations.

This design preserves global CSS/layout selectors while keeping runtime ownership isolated per island instance.

For full React pages with client-side navigation, prefer [@ecopages/react-router](../react-router/README.md), where routing and hydration are handled by the React-specific runtime.

## Server And Client Graph Contract

The React integration supports Node.js modules and server-only code, but only on the server execution graph.

- Server rendering can import and execute `node:*` modules, database clients, filesystem utilities, and `*.server.*` modules.
- Client-hydrated React code must resolve to browser-safe modules only.
- Shared files and barrel files are allowed when the exports that become client-reachable are browser-safe.
- If a server-only import becomes client-reachable, the client build fails instead of silently replacing the import.

In practice, this means you can keep server helpers close to your React code, but the browser bundle boundary is strict:

```ts
export { Button } from './button';
export { db } from './db.server';
```

If a client entry only reaches `Button`, the `db` re-export is removed from the browser transform. If a client entry reaches `db`, the build fails because the server-only export crossed into the client graph.

This contract keeps SSR and server functions free to use Node.js while ensuring the final browser bundle contains no client-reachable server-only code.
