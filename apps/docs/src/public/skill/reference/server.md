# Server and API Handlers

## Contents

- defineApiHandler
- defineGroupHandler
- Registering handlers
- Pages vs views

## defineApiHandler

```typescript
import { defineApiHandler } from '@ecopages/core';
import { z } from 'zod';

export const createPost = defineApiHandler({
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

## defineGroupHandler

```typescript
import { defineGroupHandler } from '@ecopages/core';
import { authMiddleware } from './auth';

export const adminGroup = defineGroupHandler({
	prefix: '/admin',
	middleware: [authMiddleware],
	routes: (define) => [
		define({
			path: '/',
			method: 'GET',
			handler: async (ctx) => {
				const { default: AdminView } = await import('@/views/admin');
				return ctx.render(AdminView, { user: ctx.session.user });
			},
		}),
	],
});
```

## Registering handlers

```typescript
import { createApp } from '@ecopages/core/create-app';
import appConfig from './eco.config';
import * as posts from './src/handlers/posts';
import { adminGroup } from './src/handlers/admin';

const app = await createApp({ appConfig });

app.post(posts.createPost);
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
