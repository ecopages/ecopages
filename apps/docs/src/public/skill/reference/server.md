# Server and API Handlers

## Contents

- defineApiHandler / defineGet…defineHead
- defineGroupHandler
- json / html / redirect
- Registering handlers
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

`definePost` above is equivalent to `defineApiHandler` with `method: 'POST'`.

Method helpers: `defineGet`, `definePost`, `definePut`, `defineDelete`, `definePatch`, `defineOptions`, `defineHead`.

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
import appConfig from './eco.config';
import * as posts from './src/handlers/posts';
import { adminGroup } from './src/handlers/admin';

const app = await createApp({ appConfig });

app.add(posts.createPost);
app.group(adminGroup);

await app.start();
```

## Pages vs views

When rendering from handlers with `ctx.render()`:

- Component must be `eco.page()` (not a plain framework component)
- File lives in `src/views/`, not `src/pages/`
- Import dynamically: `await import('@/views/dashboard')`

## Client-side routing (React)

With `@ecopages/react-router`, anchor tags use SPA navigation by default. Use `data-eco-reload` for full page reloads.
