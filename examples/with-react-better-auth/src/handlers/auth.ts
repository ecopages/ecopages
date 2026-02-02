import type { ApiHandlerContext } from '@ecopages/core';
import type { BunMiddleware } from '@ecopages/core/adapters/bun';
import { auth } from '@/lib/auth';

export type Session = (typeof auth)['$Infer']['Session'];

export const authMiddleware: BunMiddleware<{ session: Session }> = async (ctx, next) => {
	const session = await auth.api.getSession({
		headers: ctx.request.headers,
	});
	if (!session) {
		return Response.redirect(new URL('/login', ctx.request.url));
	}
	ctx.session = session;
	return next();
};

export const authHandler = async (ctx: ApiHandlerContext) => {
	return auth.handler(ctx.request);
};
