# Server and API Handlers

## Contents

- defineApiHandler / defineGet…defineQuery
- defineGroupHandler
- json / html / redirect
- Registering handlers
- Endpoint files
- Pages vs views

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

`definePost` above is equivalent to `defineApiHandler` with `method: 'POST'`. In a define call list `middleware` before `handler`; in `app.get()` declare every middleware as a `Middleware` or `EcoMiddleware` constant, because one inline function in a list the handler cannot see yet costs the handler the context of the whole list.

When a route declares `schema.body`, core parses `application/json` and `text/plain` bodies before validation. Malformed JSON returns HTTP 400. A request with no body and no `Content-Type`, or an empty body with either supported type, is validated as `undefined`: required schemas return HTTP 400, and optional schemas can accept it. Unsupported content types and nonempty bodies without a `Content-Type` return HTTP 415.

Method helpers: `defineGet`, `definePost`, `definePut`, `defineDelete`, `definePatch`, `defineOptions`, `defineHead`, `defineQuery`. `defineQuery`, `app.query()` and `api.query` handle the HTTP QUERY method, whose request body carries the query; it is not the context's `query` field (the URL's search parameters). Handlers may set `Accept-Query` themselves.

## defineGroupHandler

```typescript
import { defineGroupHandler } from '@ecopages/core';
import { authMiddleware } from './auth';

export const adminGroup = defineGroupHandler({
	prefix: '/admin',
	middleware: [authMiddleware],
	routes: (api) => [
		api.get({
			path: '/',
			handler: async (ctx) => {
				const { default: AdminView } = await import('@/views/admin');
				return ctx.render(AdminView, { user: ctx.session.user });
			},
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

These helpers share the same body emission path as `context.response.json()` / `context.response.html()`.

## Registering handlers

Register prebuilt `defineApiHandler` / `defineGet` declarations with `app.add()`. Use `app.get(path, handler)` when defining a route inline in `app.ts`.

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

A `*.api.ts` file under `src/pages` is an endpoint file: its path gives the URL (`src/pages/api/users/[id].api.ts` answers `/api/users/[id]`), and it needs no `app.add()`. Export one handler per method, named exactly `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD` or `QUERY`, built with the matching method helper and no `path`:

```typescript
import { defineGet } from '@ecopages/core';

export const GET = defineGet({
	handler: async ({ params, response }) => response.json({ id: params.id }),
});
```

- A method the file does not export answers `405` with an `Allow` header; export `OPTIONS` for a CORS preflight.
- Two files on the same route fail at startup, whatever the parameter names.
- A URL that ends in a static file extension (`feed.xml`, `report.json`) cannot be an endpoint file; register it in `app.ts`.
- An `app.ts` route on the same URL answers its methods first, and startup warns.

## Pages vs views

When rendering from handlers with `ctx.render()`:

- Component must be `eco.page()` (not a plain framework component)
- File lives in `src/views/`, not `src/pages/`
- Import dynamically: `await import('@/views/dashboard')`
- A full render uses the same route pipeline as a filesystem Page: every layout, default metadata, robots meta, and that view's page client plan. Props passed to the render are available to the view's `metadata`
- `ctx.renderPartial()` stays a component fragment
- The Html shell is not an island, even when its Integration differs from the page owner

## Client-side routing (React)

With `@ecopages/react-router`, anchor tags use SPA navigation by default. Use `data-eco-reload` for full page reloads.
