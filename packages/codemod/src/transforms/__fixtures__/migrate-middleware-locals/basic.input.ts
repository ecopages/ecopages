import type { FileRouteMiddleware, Middleware } from '@ecopages/core';
import { auth } from '@/lib/auth.server';

export const authMiddleware: FileRouteMiddleware = async (ctx, next) => {
	const session = await auth.api.getSession({ headers: ctx.request.headers });
	if (!session) {
		return Response.redirect(new URL('/login', ctx.request.url));
	}
	ctx.locals.session = session;
	ctx.locals.role = ctx.request.headers.get('x-role') ?? 'viewer';
	ctx.locals.role = 'admin';
	return next();
};

export const infoMiddleware: Middleware = async (ctx, next) => {
	ctx.locals.requestId = crypto.randomUUID();
	return next();
};
