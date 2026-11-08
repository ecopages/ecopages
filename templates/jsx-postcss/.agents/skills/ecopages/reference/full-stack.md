# Full-Stack Patterns

## Contents

- Installation
- Database
- Auth configuration
- Auth handler and middleware
- Client-side auth
- Protected Pages
- Environment variables

Optional pattern for apps using Better Auth with Drizzle. The [react-better-auth template](https://github.com/ecopages/ecopages/tree/main/templates/react-better-auth) is the working reference.

## Installation

```bash
pnpm add better-auth drizzle-orm @libsql/client
pnpm add -D drizzle-kit
```

## Database

Define the schema in `src/lib/schema.ts` (user, session, account, verification tables). Create `src/lib/db.server.ts` with Drizzle and libSQL (`drizzle-orm/libsql` + `@libsql/client`).

Add `drizzle.config.ts` (`dialect: 'sqlite'`, `schema: './src/lib/schema.ts'`, `dbCredentials: { url: 'file:sqlite.db' }`), then create the tables with `pnpm drizzle-kit push`. Sign-up fails until the tables exist.

## Auth configuration

`src/lib/auth.server.ts` — the `.server` suffix keeps the module, and its secret, out of browser bundles; a browser build that imports it fails:

```typescript
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db.server';

const githubClientId = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
const isGithubAuthEnabled = Boolean(githubClientId && githubClientSecret);

export const auth = betterAuth({
	secret: process.env.BETTER_AUTH_SECRET ?? 'dev-secret-min-32-chars-required!!',
	baseURL: process.env.BETTER_AUTH_URL ?? process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000',
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	emailAndPassword: { enabled: true },
	...(isGithubAuthEnabled
		? {
				socialProviders: {
					github: { clientId: githubClientId as string, clientSecret: githubClientSecret as string },
				},
			}
		: {}),
});
```

## Auth handler and middleware

`src/handlers/auth.server.ts`:

```typescript
import type { ApiHandlerContext, FileRouteMiddleware } from '@ecopages/core';
import { auth } from '@/lib/auth.server';

export type Session = (typeof auth)['$Infer']['Session'];

export const authMiddleware: FileRouteMiddleware = async (ctx, next) => {
	const session = await auth.api.getSession({ headers: ctx.request.headers });
	if (!session) {
		return Response.redirect(new URL('/login', ctx.request.url));
	}
	ctx.locals.session = session;
	return next();
};

export const authHandler = async (ctx: ApiHandlerContext) => auth.handler(ctx.request);
```

Type the Locals the middleware sets, in `modules.d.ts`:

```typescript
import type { Session } from './src/handlers/auth.server';

declare module '@ecopages/core' {
	interface RequestLocals {
		session?: Session | null;
	}
}
```

Register the handler as Explicit Routes in `app.ts`:

```typescript
import { createApp } from '@ecopages/core/create-app';
import * as authRoutes from './src/handlers/auth.server';

const app = await createApp();

await app
	.get('/api/auth/*', authRoutes.authHandler)
	.post('/api/auth/*', authRoutes.authHandler)
	.put('/api/auth/*', authRoutes.authHandler)
	.delete('/api/auth/*', authRoutes.authHandler)
	.options('/api/auth/*', authRoutes.authHandler)
	.start();
```

## Client-side auth

```typescript
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
	baseURL: typeof window !== 'undefined' ? window.location.origin : '',
});
```

## Protected Pages

A Page with `middleware` must set `cache: 'dynamic'`, or the request fails. Declare `requires` for the Locals it reads, and read them from `locals` in `render`:

```tsx
import { eco } from '@ecopages/core';
import { authMiddleware } from '@/handlers/auth.server';

export default eco.page({
	cache: 'dynamic',
	middleware: [authMiddleware],
	requires: ['session'] as const,
	render: ({ locals }) => <h1>Hello {locals?.session?.user.name}</h1>,
});
```

## Environment variables

```bash
ECOPAGES_BASE_URL=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=your-secret-at-least-32-characters-long
# Optional GitHub OAuth. Leave empty for email/password only.
# Callback URL: http://localhost:3000/api/auth/callback/github
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

## Resources

- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Better Auth GitHub provider](https://www.better-auth.com/docs/authentication/github)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
