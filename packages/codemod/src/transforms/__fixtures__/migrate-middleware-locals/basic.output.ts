import { createMiddleware } from '@ecopages/core';
import { auth } from '@/lib/auth.server';

export const authMiddleware = createMiddleware(async (ctx, next) => {
	const session = await auth.api.getSession({ headers: ctx.request.headers });
	if (!session) {
		return Response.redirect(new URL('/login', ctx.request.url));
	}
	ctx.request.headers.get('x-role') ?? 'viewer';
	return next({
		session,
		role: 'admin',
	});
});

export const infoMiddleware = createMiddleware(async (ctx, next) => {
	const requestId = crypto.randomUUID();
	return next({
		requestId,
	});
});
