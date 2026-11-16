import type { EcoMiddleware } from '@ecopages/core';

type AuthContext = { user: string };

export const legacy: EcoMiddleware<AuthContext> = async (ctx, next) => {
	ctx.user = 'a';
	return next();
};
