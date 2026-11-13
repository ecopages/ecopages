import type { ApiHandlerContext } from '@ecopages/core';
import { Option, Schema } from 'effect';
import { authRuntime } from './auth.server';
import { authenticate, Credentials, endSession } from './credentials.server';
import { redirect, sameOrigin } from './http.server';

export async function submitCredentials({ request }: ApiHandlerContext) {
	if (!sameOrigin(request)) return new Response('Invalid origin', { status: 403 });
	const form = await request.formData().catch(() => null);
	const signup = form?.get('intent') === 'signup';
	const failure = signup ? '/?mode=signup&error=signup' : '/?error=login';
	const credentials = Schema.decodeUnknownOption(Credentials)({
		intent: signup ? 'signup' : 'login',
		email: form?.get('email'),
		password: form?.get('password'),
		name: form?.get('name'),
	});
	if (Option.isNone(credentials)) return redirect(failure);
	const response = await authRuntime.runPromise(authenticate(credentials.value));
	return response.ok ? redirect('/dashboard', response) : redirect(failure);
}

export async function signOut({ request }: ApiHandlerContext) {
	if (!sameOrigin(request)) return new Response('Invalid origin', { status: 403 });
	const response = await authRuntime.runPromise(endSession(request.headers));
	return response.ok
		? redirect('/', response)
		: new Response('Could not sign out. Please try again.', { status: 500 });
}
