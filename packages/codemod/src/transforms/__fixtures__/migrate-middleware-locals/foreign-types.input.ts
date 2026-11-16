import type { Middleware } from 'other-lib';

export const stage: Middleware = async (ctx, next) => {
	ctx.locals.x = 1;
	return next();
};
