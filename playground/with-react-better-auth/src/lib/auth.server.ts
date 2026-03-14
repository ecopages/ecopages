import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db.server';

const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000';
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret || secret.length < 32) {
	console.warn('BETTER_AUTH_SECRET should be set to at least 32 characters for production.');
}

export const auth = betterAuth({
	secret: secret ?? 'dev-secret-min-32-chars-required!!',
	baseURL: baseUrl,
	database: drizzleAdapter(db, {
		provider: 'sqlite',
	}),
	emailAndPassword: {
		enabled: true,
	},
});
