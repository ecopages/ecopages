# @ecopages/core

The foundational engine for the Ecopages framework. It provides the core build pipeline, development server, routing, and plugin architecture required to run an Ecopages application.

## Overview

Ecopages is an extensible static site generator (SSG) that runs on Node. It embraces a strictly MPA (Multi-Page Application) architecture by default, rendering HTML at build-time or request-time, and hydrating interactive islands only where necessary.

- **Runtime Boundary**: `createApp()` uses the Node HTTP host.
- **Build Ownership**: Rolldown builds the app.
- **Framework agnostic**: First-class support for KitaJS, Lit, React, and MDX via official integration plugins.
- **Extensible**: Hook into the build process with custom processors or rendering integrations.

## Architecture

How core works inside (config and `AppRuntime`, the build, rendering, the dev server and HMR) is described in the [developer pages](../../apps/docs/src/content/dev), served at `/dev` on the docs site. Start with the [overview](../../apps/docs/src/content/dev/index.mdx).

## Installation

```bash
pnpm add @ecopages/core
```

You can also use `npm` or `yarn`.

## Basic Usage

The Ecopages architecture revolves around an `eco.config.ts` file and an application entry point.

### 1. Configuration (`eco.config.ts`)

Configure your integrations, processors, and default metadata:

```typescript
import { defineConfig } from '@ecopages/core/config';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';

export default defineConfig({
	baseUrl: 'https://example.com',
	defaultMetadata: {
		title: 'My Ecopages Site',
		description: 'Built with Ecopages',
	},
	integrations: [ecopagesJsxPlugin()],
});
```

### 2. Application Entry (`app.ts`)

Start the application using `createApp`. It automatically resolves and loads `eco.config.ts` from the project root and serves through the Node HTTP host:

```typescript
import { createApp } from '@ecopages/core/create-app';

const app = await createApp();

await app.start();
```

### 3. Creating Pages

Use the `eco.page()` factory to define a page. A file in `src/pages/` default-exports one:

```tsx
import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page({
	layout: BaseLayout,
	metadata: () => ({
		title: 'Home',
	}),
	render: () => (
		<div>
			<h1>Welcome to Ecopages</h1>
		</div>
	),
});
```

Plain `.html` files in `src/pages/` are HTML Pages and need no Integration: `src/pages/about.html` becomes `/about`, rendered inside `src/includes/html.*` or a built-in HTML template. See [HTML Pages](https://ecopages.app/docs/core/pages#html-pages).

### 4. Reusable Components

A component's imported stylesheet is injected only when a Page uses it, plain function or not. Define components with `eco.component()` when they also need scripts, `modules`, stylesheet attributes, an `integration` override, or rendering by another Integration:

```tsx
import { eco } from '@ecopages/core';

export const MyButton = eco.component({
	dependencies: {
		stylesheets: ['./button.css'],
	},
	render: ({ label }) => <button className="my-button">{label}</button>,
});
```

Dependency ownership affects final asset packaging:

- Stylesheets and scripts declared from `eco.html()` stay Html-owned and can be emitted as shared app-wide assets.
- Stylesheets and scripts declared from Pages, Layouts, or Components are resolved into page-owned assets for the rendered route.
- This split is intentional. Shared Html assets can be cached across routes, while page-owned assets can change without invalidating the global shell.

### 5. API Handlers

Add server-side routes using `defineApiHandler` or the method helpers (`defineGet`, `definePost`, …). Register them on your `app` instance before starting:

```typescript
import { defineApiHandler, defineGet, json } from '@ecopages/core';

export const helloWorld = defineGet({
	path: '/api/hello',
	handler: async ({ response }) => {
		return response.json({ message: 'Hello World' });
	},
});

// Equivalent with an explicit method:
export const helloWorldAlt = defineApiHandler({
	path: '/api/hello',
	method: 'GET',
	handler: async () => json({ message: 'Hello World' }),
});
```

`defineQuery`, `app.query()` and `api.query` handle the HTTP QUERY method (RFC 10008): a safe, idempotent read whose request body carries the query. It takes a `schema.body` like `definePost`, and Ecopages adds no caching, `Accept-Query` or `Vary`; set them on the response if you want them. QUERY here is the method, not the handler context's `query` field (the URL's search parameters).

Group related routes with `defineGroupHandler`. Prefer `api.get` / `api.post` helpers inside the `routes` callback:

```typescript
import { defineGroupHandler } from '@ecopages/core';

export const adminGroup = defineGroupHandler({
	prefix: '/admin',
	routes: (api) => [
		api.get({
			path: '/',
			handler: async ({ response }) => response.json({ ok: true }),
		}),
		api.post({
			path: '/items',
			handler: async ({ response }) => response.status(201).json({ created: true }),
		}),
	],
});
```

Standalone response helpers (`json`, `html`, `redirect`) share the same body emission path as `context.response.json()` / `context.response.html()`.

Register a prebuilt handler with `app.add()`. Use `app.get(path, handler)` only when defining the route inline in `app.ts`.

The method helpers also accept a handler without `path`, for an export of an endpoint file (`*.api.ts`, `.api.tsx`, `.api.js` or `.api.jsx`), whose path under the pages directory gives the URL. The `api.get` / `api.post` group helpers still require `path`, and `app.add()` and `app.group()` throw for a handler without one.

The filesystem form of the same handler is an endpoint file. `src/pages/api/hello.api.ts` answers `/api/hello` with no `app.add()` call:

```typescript
import { defineGet } from '@ecopages/core';

export const GET = defineGet({
	handler: async ({ response }) => response.json({ message: 'Hello World' }),
});
```

The file's rules (405 and `Allow`, load errors, `app.ts` routes on the same URL) are in the [Endpoint Files docs](https://ecopages.app/docs/server/endpoint-files); the internals are on the [Routing](../../apps/docs/src/content/dev/routing.mdx) developer page. A build of an app with an endpoint file publishes the server bundle (`dist/server/`), emits server modules, then checks each file's exports, even when nothing else registers a handler, so `ecopages start` serves it.

### 6. Error pages

Filesystem `src/pages/404.*` and `500.*` take precedence. For explicit-route apps, register views on the app:

```typescript
import NotFoundView from './src/views/not-found.kita';
import ServerErrorView from './src/views/server-error.kita';

app.notFound(NotFoundView);
app.serverError(ServerErrorView);
```

Import a view and pass it to `ctx.render`, `ctx.renderPartial`, `app.static()`, or an error-page helper. The default export of an Integration-owned file becomes a view reference: development loads it through the app module loader so a save reloads without a restart, and production reads the module `ecopages build` wrote to `dist/server/`. A file without a default export, such as a file of named plain components, imports as itself. A full explicit view renders through the same route pipeline as a filesystem Page, including its layouts, default metadata, robots meta, and page client plan. Props passed to the render are available to the view's `metadata`.

When no custom page is configured, built-in HTML defaults are served instead.

Attach the handler in your `app.ts` entry:

```typescript
import { createApp } from '@ecopages/core/create-app';
import { helloWorld } from './handlers/hello';

const app = await createApp();

app.add(helloWorld);

await app.start();
```

See the [official documentation](https://ecopages.app) for advanced usage, API handlers, and integrations.

## Import Structure

Use the `create-app` subpath for runtime startup and the root package for standard authoring helpers:

```ts
import { createApp } from '@ecopages/core/create-app';
import { defineApiHandler, defineGet, defineGroupHandler, eco } from '@ecopages/core';
```

> [!NOTE]
> Use `createApp()` from `@ecopages/core/create-app` as the application entrypoint.

## Entry Point Roles

The published subpaths are grouped by architectural role rather than by source folder.

### App Authoring

Use these entrypoints when building an Ecopages app:

- `@ecopages/core`
- `@ecopages/core/create-app`
- `@ecopages/core/config`
- `@ecopages/core/errors`
- `@ecopages/core/declarations` (types only; also declares side-effect CSS imports, so they typecheck without per-project declarations)
- `@ecopages/core/env` (types only)

### Integration Authoring

Use `@ecopages/core/integration` for Integration contracts, render hooks, and shared Integration runtime helpers.

### Processor Authoring

Use `@ecopages/core/processor` for Processor contracts and generated-asset helpers. A stylesheet Processor runs the cases of `stylesheetProcessorContract` from `@ecopages/core/processor/contract` in its tests.

### Build Extensions

Use `@ecopages/core/build` for build adapters and build plugins. Use `@ecopages/core/build/contracts` for stable build contracts that also need to be safe in browser build graphs.

### Browser Runtime Extensions

Use `@ecopages/core/client` for browser navigation and client runtime helpers.

### Runtime-Loaded Entries

`@ecopages/core/config/write-types`, `@ecopages/core/hmr/client/hmr-runtime`, and `@ecopages/core/view-reference` remain exported because Ecopages loads them by path at runtime. They are implementation entries, not general authoring surfaces. App authors import the view file, not this subpath.

`@ecopages/core/errors` remains an alias for the root error exports.
