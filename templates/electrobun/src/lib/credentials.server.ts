import { Effect, Schema } from 'effect';
import { authClient } from './auth.server';
import { origin } from './settings';

const fields = { email: Schema.String, password: Schema.String };

export const Credentials = Schema.Union([
	Schema.Struct({ intent: Schema.Literal('login'), ...fields }),
	Schema.Struct({ intent: Schema.Literal('signup'), ...fields, name: Schema.String }),
]);

function postToAuth(path: string, options: RequestInit) {
	return Effect.gen(function* () {
		const auth = yield* authClient;
		return yield* Effect.promise(() =>
			auth.handler(new Request(new URL(path, origin), { ...options, method: 'POST' })),
		);
	});
}

export function authenticate(credentials: typeof Credentials.Type) {
	const { intent, ...body } = credentials;
	return postToAuth(intent === 'signup' ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email', {
		headers: { 'Content-Type': 'application/json', Origin: origin },
		body: JSON.stringify(body),
	});
}

export function endSession(headers: Headers) {
	return postToAuth('/api/auth/sign-out', { headers });
}
