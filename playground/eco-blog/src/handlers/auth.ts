import type { ApiHandlerContext, Middleware } from '@ecopages/core';
import { auth } from '@/lib/auth';

export type Session = typeof auth.$Infer.Session;

type AuthContext = ApiHandlerContext<Request, unknown> & {
	session: Session;
};

export const authMiddleware: Middleware<Request, unknown, AuthContext> = async (ctx, next) => {
	const session = await auth.api.getSession({
		headers: ctx.request.headers,
	});
	if (!session) {
		return Response.redirect('/login');
	}
	ctx.session = session;
	return next();
};

export const authHandler = async (ctx: ApiHandlerContext) => {
	return auth.handler(ctx.request);
};
