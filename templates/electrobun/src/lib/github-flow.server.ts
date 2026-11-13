import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Clock, Effect, Schema } from 'effect';
import open from 'open';
import { authClient } from './auth.server';
import { githubEnabled, origin } from './settings';

export const GithubClaim = Schema.Struct({ id: Schema.String, proof: Schema.String });
const Authorization = Schema.Struct({ url: Schema.String });

type Flow = {
	proof: string;
	expiresAt: number;
	status: 'created' | 'launched' | 'complete' | 'failed';
	token?: string;
};

const flows = new Map<string, Flow>();
const flowLifetime = 5 * 60 * 1000;
const completionPath = '/auth/github/complete';

function sameProof(expected: string, actual: string) {
	const left = Buffer.from(expected);
	const right = Buffer.from(actual);
	return left.length === right.length && timingSafeEqual(left, right);
}

function findFlow(id: string, now: number) {
	const flow = flows.get(id);
	if (flow && flow.expiresAt > now) return flow;
	flows.delete(id);
}

export const beginGithubFlow = Effect.gen(function* () {
	if (!githubEnabled) return yield* Effect.fail('unavailable' as const);
	const now = yield* Clock.currentTimeMillis;
	for (const id of flows.keys()) findFlow(id, now);
	if (flows.size >= 16) return yield* Effect.fail('capacity' as const);

	const id = randomBytes(24).toString('hex');
	const proof = randomBytes(32).toString('hex');
	const url = new URL('/auth/github/launch', origin);
	url.searchParams.set('id', id);
	flows.set(id, { proof, expiresAt: now + flowLifetime, status: 'created' });

	yield* Effect.tryPromise({
		try: () => open(url.href, { wait: false }),
		catch: () => 'browser' as const,
	}).pipe(Effect.tapError(() => Effect.sync(() => flows.delete(id))));

	return { id, proof };
});

export function authorizeGithubFlow(id: string) {
	return Effect.gen(function* () {
		const flow = findFlow(id, yield* Clock.currentTimeMillis);
		if (flow?.status !== 'created') return yield* Effect.fail('expired' as const);
		flow.status = 'launched';

		const auth = yield* authClient;
		const callback = new URL(completionPath, origin);
		callback.searchParams.set('id', id);
		const callbackURL = callback.href;
		const authorization = yield* Effect.tryPromise({
			try: async () => {
				const response = await auth.api.signInSocial({
					body: { provider: 'github', callbackURL, errorCallbackURL: callbackURL, disableRedirect: true },
					asResponse: true,
				});
				const result: unknown = await response.json();
				return { response, result };
			},
			catch: () => 'authorization' as const,
		}).pipe(Effect.tapError(() => Effect.sync(() => void (flow.status = 'failed'))));
		const { response, result } = authorization;
		if (!response.ok || !Schema.is(Authorization)(result) || !result.url) {
			flow.status = 'failed';
			return yield* Effect.fail('authorization' as const);
		}
		return { url: result.url, response };
	});
}

/** @remarks Only a successful Better Auth callback can issue the one-time token the desktop will redeem. */
export function completeGithubFlow(request: Request) {
	return Effect.gen(function* () {
		const auth = yield* authClient;
		const response = yield* Effect.tryPromise({
			try: () => auth.handler(request),
			catch: () => 'expired' as const,
		});
		const location = new URL(response.headers.get('Location') ?? '/', origin);
		const flow = findFlow(location.searchParams.get('id') ?? '', yield* Clock.currentTimeMillis);
		if (location.origin !== origin || location.pathname !== completionPath || flow?.status !== 'launched') {
			return yield* Effect.fail('expired' as const);
		}

		const token = response.headers.get('set-ott');
		flow.status = token ? 'complete' : 'failed';
		if (token) flow.token = token;
		return Boolean(token);
	});
}

export function redeemGithubFlow({ id, proof }: typeof GithubClaim.Type) {
	return Effect.gen(function* () {
		const flow = findFlow(id, yield* Clock.currentTimeMillis);
		if (!flow || !sameProof(flow.proof, proof)) return yield* Effect.fail('expired' as const);
		if (flow.status === 'created' || flow.status === 'launched') return yield* Effect.fail('pending' as const);

		flows.delete(id);
		const token = flow.token;
		if (!token) return yield* Effect.fail('rejected' as const);
		const auth = yield* authClient;
		const response = yield* Effect.promise(() =>
			auth.api.verifyOneTimeToken({ body: { token }, asResponse: true }),
		);
		if (!response.ok) return yield* Effect.fail('rejected' as const);
		return response.headers.getSetCookie();
	});
}
