import type { ApiHandlerContext } from '@ecopages/core';
import type { BunMiddleware } from '@ecopages/core/adapters/bun';
import { auth } from '@/lib/auth';
import { LoginView } from '@/views/auth/login.kita';
import { SignupView } from '@/views/auth/signup.kita';

export type Session = typeof auth.$Infer.Session;

export const authMiddleware: BunMiddleware<{ session: Session }> = async (ctx, next) => {
	const session = await auth.api.getSession({
		headers: ctx.request.headers,
	});
	if (!session) {
		return Response.redirect('/login');
	}
	ctx.session = session;
	return next();
};

export const authHandler = async (ctx: ApiHandlerContext<Bun.BunRequest<string>>) => {
	return auth.handler(ctx.request);
};

export async function loginPage(ctx: ApiHandlerContext) {
	return ctx.render(LoginView, {});
}

export async function signupPage(ctx: ApiHandlerContext) {
	return ctx.render(SignupView, {});
}
