# Server and API Handlers

## Contents

- defineApiHandler / defineGet…defineQuery
- defineGroupHandler
- json / html / redirect
- Registering handlers
- Endpoint files
- Pages vs views
- Client-side routing (React)

## defineApiHandler

```typescript
import { defineApiHandler, definePost } from '@ecopages/core';
import { z } from 'zod';

export const createPost = definePost({
	path: '/api/posts',
	schema: {
		body: z.object({
			title: z.string().min(1),
			content: z.string(),
		}),
	},
	handler: async ({ body, response }) => {
		const post = await createPostInDB(body);
		return response.status(201).json(post);
	},
});

export const createPostAlt = defineApiHandler({
	path: '/api/posts',
	method: 'POST',
	schema: {
		body: z.object({
			title: z.string().min(1),
			content: z.string(),
		}),
	},
	handler: async ({ body, response }) => {
		const post = await createPostInDB(body);
		return response.status(201).json(post);
	},
});
```

`definePost` above is equivalent to `defineApiHandler` with `method: 'POST'`.

A handler written before a middleware list that holds an unannotated inline function sees none of the list's contexts. In define calls, put `middleware` before `handler`. In `app.get/post/…/group`, where options always come last, declare each middleware as a `Middleware` or `EcoMiddleware` constant.

When a route declares `schema.body`, core parses `application/json` and `text/plain` bodies before validation. Malformed JSON returns HTTP 400. A request with no body and no `Content-Type`, or an empty body with either supported type, is validated as `undefined`: required schemas return HTTP 400, and optional schemas can accept it. Unsupported content types and nonempty bodies without a `Content-Type` return HTTP 415.

Method helpers: `defineGet`, `definePost`, `definePut`, `defineDelete`, `definePatch`, `defineOptions`, `defineHead`, `defineQuery`. `defineQuery`, `app.query()` and `api.query` handle the HTTP QUERY method, whose request body carries the query; it is not the context's `query` field (the URL's search parameters). Handlers may set `Accept-Query` themselves.

## defineGroupHandler

```typescript
import { defineGroupHandler } from '@ecopages/core';
import { authMiddleware } from './auth';
import AdminView from '../views/admin.tsx';

export const adminGroup = defineGroupHandler({
	prefix: '/admin',
	middleware: [authMiddleware],
	routes: (api) => [
		api.get({
			path: '/',
			handler: async (ctx) =>
				ctx.render(AdminView, { user: ctx.session.user }),
		}),
		api.post({
			path: '/items',
			handler: async (ctx) => ctx.response.status(201).json({ created: true }),
		}),
	],
});
```

The `routes` callback also accepts the callable form `api({ path, method, handler })` when you need an uncommon method shape. Prefer `api.get` / `api.post` for standard verbs.

## json / html / redirect

Standalone helpers from `@ecopages/core` for handlers that return a body without using `context.response`:

```typescript
import { defineGet, json, html, redirect } from '@ecopages/core';

export const health = defineGet({
	path: '/api/health',
	handler: async () => json({ ok: true }),
});

export const landing = defineGet({
	path: '/landing',
	handler: async () => html('<p>hi</p>'),
});

export const loginRedirect = defineGet({
	path: '/login',
	handler: async () => redirect('/sign-in', 303),
});
```

`json` and `html` behave like `ctx.response.json()` / `ctx.response.html()` and take `{ status, headers }`.

## Registering handlers

Register prebuilt `defineApiHandler` / `defineGet` declarations with `app.add()` and groups with `app.group()`. Use `app.get(path, handler)` for an Explicit Route defined inline in `app.ts`. For `app.onError`, `HttpError` (`@ecopages/core/errors`), `app.static`, `app.notFound` and `app.serverError`, see [/docs-llm/server/explicit-routing.md](/docs-llm/server/explicit-routing.md).

```typescript
import { createApp } from '@ecopages/core/create-app';
import * as posts from './src/handlers/posts';
import { adminGroup } from './src/handlers/admin';

const app = await createApp();

app.add(posts.createPost);
app.group(adminGroup);

await app.start();
```

## Endpoint files

A file under `src/pages` ending in `.api.ts`, `.api.tsx`, `.api.js` or `.api.jsx` is an endpoint file: its path gives the URL (`src/pages/api/users/[id].api.ts` answers `/api/users/42` with `params.id === '42'`; declare `schema.params` to type it), and it needs no `app.add()`. Those endings are reserved; no Integration can register them. Export one handler per method, named exactly `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD` or `QUERY`, built with the matching method helper and no `path`. Other exports are ignored.

```typescript
import { defineGet } from '@ecopages/core';

export const GET = defineGet({
	handler: async ({ params, response }) => response.json({ id: params.id }),
});
```

- A method the file does not export answers `405` with an `Allow` header. `HEAD` is not answered from `GET`, and `OPTIONS` is not added; export `OPTIONS` for a CORS preflight.
- A missing method export, a non-handler export, a handler built for another method, or a set `path` fails `ecopages build`; in dev, the file's first request answers `500`. The build imports each file, so its top-level code runs at build time.
- Two files on the same route fail at startup, whatever the parameter names.
- A URL that ends in a static file extension (`feed.xml`, `report.json`) cannot be an endpoint file; register it as an Explicit Route in `app.ts`.
- An Explicit Route on the same URL answers its methods first, and startup warns.
- Dev reloads the file on save. The build emits the server bundle (`dist/.server/`) for `ecopages start`; `ecopages preview` does not serve endpoints.

Full rules: [/docs-llm/server/endpoint-files.md](/docs-llm/server/endpoint-files.md).

## Pages vs views

When rendering from handlers with `ctx.render()`:

- Component must be the default export, built with `eco.page()` (not a plain framework component)
- File lives in `src/views/`, not `src/pages/`
- Import it and pass it to `ctx.render(Dashboard, props)`. An Integration-owned import becomes a view reference: development reloads on save, production reads the built module
- Handler renders pass the request's Locals, Params and Query to the view as props. Call `ctx.render(...)` on the context; destructuring `render` loses Locals
- A full render uses the same route pipeline as a filesystem Page: every layout, default metadata, robots meta, and that view's page client plan. Props passed to the render are available to the view's `metadata`
- `ctx.renderPartial()` stays a component fragment
- The Html shell is not an island, even when its Integration differs from the page owner

## Client-side routing (React)

With `@ecopages/react-router`, anchor tags use SPA navigation by default. Use `data-eco-reload` for full page reloads.
