import type { ApiHandlerContext, FileRouteMiddleware } from '@ecopages/core';
import { auth } from '@/lib/auth.server';

export type Session = (typeof auth)['$Infer']['Session'];

export const authMiddleware: FileRouteMiddleware = async (ctx, next) => {
	const session = await auth.api.getSession({
		headers: ctx.request.headers,
	});
	if (!session) {
		return Response.redirect(new URL('/login', ctx.request.url));
	}
	ctx.locals.session = session;
	return next();
};

export const authHandler = async (ctx: ApiHandlerContext) => {
	return auth.handler(ctx.request);
};
