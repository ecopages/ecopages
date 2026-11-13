import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FileRouteMiddleware } from '@ecopages/core';
import { fileSystem } from '@ecopages/file-system';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { oneTimeToken } from 'better-auth/plugins/one-time-token';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { Context, Data, Effect, Layer, ManagedRuntime } from 'effect';
import { dataDirectory, githubClientId, githubClientSecret, isLocalRequest, origin, port } from './settings';
import { sidebarStartsOpen } from './sidebar-preference';

const appSettings = sqliteTable('app_settings', {
	key: text().primaryKey(),
	value: text().notNull(),
});

class AuthSetupError extends Data.TaggedError('AuthSetupError')<{
	readonly message: string;
	readonly cause: unknown;
}> {}

const openDatabase = Effect.acquireRelease(
	Effect.try({
		try: () => {
			const directory = resolve(dataDirectory);
			fileSystem.ensureDir(directory);
			return new DatabaseSync(resolve(directory, 'auth.sqlite'));
		},
		catch: (cause) => new AuthSetupError({ message: 'Could not open the workspace database.', cause }),
	}),
	(database) => Effect.sync(() => database.close()),
);

const initializeAuth = Effect.gen(function* () {
	const database = yield* openDatabase;
	const secret = yield* Effect.try({
		try: () => {
			const db = drizzle({ client: database });
			db.run(sql`PRAGMA busy_timeout = 5000`);
			db.run(sql`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
			db.insert(appSettings)
				.values({ key: 'auth_secret', value: randomBytes(32).toString('hex') })
				.onConflictDoNothing()
				.run();
			const row = db
				.select({ value: appSettings.value })
				.from(appSettings)
				.where(eq(appSettings.key, 'auth_secret'))
				.get();
			if (!row) throw new Error('The auth secret row is missing.');
			return row.value;
		},
		catch: (cause) => new AuthSetupError({ message: 'Could not configure workspace authentication.', cause }),
	});

	const options = {
		baseURL: origin,
		secret,
		database,
		emailAndPassword: { enabled: true },
		socialProviders:
			githubClientId && githubClientSecret
				? {
						github: { clientId: githubClientId, clientSecret: githubClientSecret },
					}
				: {},
		account: {
			accountLinking: { enabled: false },
			encryptOAuthTokens: true,
		},
		advanced: { cookiePrefix: `ecopages-desktop-${port}` },
		rateLimit: { enabled: true },
		telemetry: { enabled: false },
		plugins: [oneTimeToken({ disableClientRequest: true, storeToken: 'hashed', setOttHeaderOnNewSession: true })],
	} satisfies BetterAuthOptions;
	return yield* Effect.tryPromise({
		try: async () => {
			const { runMigrations } = await getMigrations(options);
			await runMigrations();
			return betterAuth(options);
		},
		catch: (cause) => new AuthSetupError({ message: 'Could not migrate the auth database.', cause }),
	});
});

type Auth = Effect.Success<typeof initializeAuth>;
export type Session = Auth['$Infer']['Session'];

export const authClient = Context.Service<Auth>('ecopages-electrobun-starter/Auth');
const authLayer = Layer.effect(authClient, initializeAuth);

/** @remarks The entry and Page bundles each load this module and must share the same database scope. */
const authKey = Symbol.for('ecopages-electrobun-starter.auth-runtime');
const processServices = globalThis as typeof globalThis & {
	[authKey]?: ManagedRuntime.ManagedRuntime<Auth, AuthSetupError>;
};
export const authRuntime = (processServices[authKey] ??= ManagedRuntime.make(authLayer));

export function readSession(headers: Headers) {
	return authClient.pipe(Effect.flatMap((auth) => Effect.promise(() => auth.api.getSession({ headers }))));
}

/**
 * Rejects non-loopback hosts, reads the session and hands it to `onSession` or `onAnonymous`.
 */
export async function withSession(
	ctx: { request: Request },
	onSession: (session: Session) => Response | Promise<Response>,
	onAnonymous: () => Response | Promise<Response>,
): Promise<Response> {
	if (!isLocalRequest(ctx.request)) return new Response('Invalid host', { status: 403 });
	const session = await authRuntime.runPromise(readSession(ctx.request.headers));
	return session ? onSession(session) : onAnonymous();
}

export const requireSession: FileRouteMiddleware = (ctx, next) =>
	withSession(
		ctx,
		(session) => {
			ctx.locals.workspace = { session, sidebarOpen: sidebarStartsOpen(ctx.request.headers.get('cookie') ?? '') };
			return next();
		},
		() => Response.redirect(new URL('/', origin)),
	);
