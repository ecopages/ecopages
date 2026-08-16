import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db.server';

const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000';
const secret = process.env.BETTER_AUTH_SECRET;
const githubClientId = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;

export const isGithubAuthEnabled = Boolean(githubClientId && githubClientSecret);

if (!secret || secret.length < 32) {
	console.warn('BETTER_AUTH_SECRET should be set to at least 32 characters for production.');
}

if (!isGithubAuthEnabled) {
	console.warn(
		'GitHub sign-in is off. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env. If you only want password login, remove the GitHub warning in social-sign-in.tsx.',
	);
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
	onAPIError: {
		errorURL: `${baseUrl}/login`,
	},
	account: {
		accountLinking: {
			trustedProviders: isGithubAuthEnabled ? ['github'] : [],
		},
	},
	...(isGithubAuthEnabled
		? {
				socialProviders: {
					github: {
						clientId: githubClientId as string,
						clientSecret: githubClientSecret as string,
					},
				},
			}
		: {}),
});
