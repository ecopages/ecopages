import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db.server';

export const auth = betterAuth({
	secret: process.env.BETTER_AUTH_SECRET ?? 'eco-blog-dev-secret-at-least-32-chars',
	baseURL: process.env.BETTER_AUTH_URL ?? process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000',
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	emailAndPassword: { enabled: true },
});

export type Session = typeof auth.$Infer.Session;
