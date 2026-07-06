# Full-Stack Patterns

## Contents

- Better Auth installation
- Database and auth config
- Auth handler and middleware
- Client-side auth
- Protected routes

Optional pattern for apps using Better Auth with Drizzle. See [with-react-better-auth example](https://github.com/ecopages/ecopages/tree/main/examples/with-react-better-auth).

## Installation

```bash
bun add better-auth drizzle-orm
bun add -D drizzle-kit
```

## Database

Define schema in `src/lib/schema.ts` (user, session, account, verification tables). Create `src/lib/db.ts` with Drizzle + SQLite.

## Auth configuration

```typescript
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';

export const auth = betterAuth({
	secret: process.env.BETTER_AUTH_SECRET ?? 'dev-secret-min-32-chars-required!!',
	baseURL: process.env.BETTER_AUTH_URL ?? process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000',
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	emailAndPassword: { enabled: true },
});
```

## Auth handler

```typescript
import type { ApiHandlerContext, EcoMiddleware } from '@ecopages/core';
import { auth } from '@/lib/auth';

export type Session = (typeof auth)['$Infer']['Session'];

export const authMiddleware: EcoMiddleware<{ session: Session }> = async (ctx, next) => {
	const session = await auth.api.getSession({ headers: ctx.request.headers });
	if (!session) {
		return Response.redirect(new URL('/login', ctx.request.url));
	}
	ctx.session = session;
	return next();
};

export const authHandler = async (ctx: ApiHandlerContext) => auth.handler(ctx.request);
```

Register in `app.ts`:

```typescript
app.get('/api/auth/*', auth.authHandler).post('/api/auth/*', auth.authHandler);
```

## Client-side auth

```typescript
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
	baseURL: typeof window !== 'undefined' ? window.location.origin : '',
});
```

## Protected routes

Use `authMiddleware` with `defineGroupHandler` and render views from `src/views/` via `ctx.render()`.

## Environment variables

```bash
ECOPAGES_BASE_URL=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=your-secret-at-least-32-characters-long
```

## Resources

- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
