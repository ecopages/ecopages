import type { ApiHandlerContext } from '@ecopages/core';
import { Effect, Option, Result, Schema } from 'effect';
import { authRuntime } from './auth.server';
import { redirect, sameOrigin } from './http.server';
import {
	authorizeGithubFlow,
	beginGithubFlow,
	completeGithubFlow,
	GithubClaim,
	redeemGithubFlow,
} from './github-flow.server';
import { isLocalRequest } from './settings';

type GithubRequest = Pick<ApiHandlerContext, 'request'>;

const startFailures = {
	unavailable: { message: 'GitHub sign-in is unavailable', status: 503 },
	capacity: { message: 'Too many pending sign-ins', status: 429 },
	browser: { message: 'Could not open the system browser', status: 502 },
};

export async function startGithub({ request }: GithubRequest) {
	if (!sameOrigin(request)) return new Response('Invalid origin', { status: 403 });
	const result = await Effect.runPromise(Effect.result(beginGithubFlow));
	if (Result.isFailure(result)) {
		const { message, status } = startFailures[result.failure];
		return new Response(message, { status });
	}
	return Response.json(result.success, { headers: { 'Cache-Control': 'no-store' } });
}

export async function launchGithub({ request }: GithubRequest) {
	if (!isLocalRequest(request)) return browserMessage('This sign-in link has expired.', 410);
	const id = new URL(request.url).searchParams.get('id') ?? '';
	const result = await authRuntime.runPromise(Effect.result(authorizeGithubFlow(id)));
	if (Result.isFailure(result)) {
		return result.failure === 'expired'
			? browserMessage('This sign-in link has expired.', 410)
			: browserMessage('Could not start GitHub sign-in.', 502);
	}
	return redirect(result.success.url, result.success.response);
}

export async function finishGithub({ request }: GithubRequest) {
	if (!isLocalRequest(request)) return new Response('Invalid host', { status: 403 });
	const result = await authRuntime.runPromise(Effect.result(completeGithubFlow(request)));
	if (Result.isFailure(result)) {
		return browserMessage('This sign-in link has expired. Return to the app and try again.', 410);
	}
	return browserMessage(
		result.success
			? 'Signed in. You can close this tab and return to the app.'
			: 'GitHub sign-in did not finish. Return to the app and try again.',
	);
}

const claimStatuses = { expired: 410, pending: 202, rejected: 401 };

export async function claimGithub({ request }: GithubRequest) {
	if (!sameOrigin(request)) return new Response('Invalid origin', { status: 403 });
	const claim = Schema.decodeUnknownOption(GithubClaim)(await request.json().catch(() => null));
	if (Option.isNone(claim)) return new Response(null, { status: 400 });
	const result = await authRuntime.runPromise(Effect.result(redeemGithubFlow(claim.value)));
	if (Result.isFailure(result)) return new Response(null, { status: claimStatuses[result.failure] });
	const headers = new Headers({ 'Cache-Control': 'no-store' });
	for (const cookie of result.success) headers.append('Set-Cookie', cookie);
	return new Response(null, { status: 204, headers });
}

function browserMessage(message: string, status = 200) {
	return new Response(message, {
		status,
		headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
	});
}
