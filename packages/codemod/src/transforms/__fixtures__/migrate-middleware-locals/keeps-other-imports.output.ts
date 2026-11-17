import { createMiddleware, type ApiHandlerContext } from '@ecopages/core';

export const stage = createMiddleware(async (ctx, next) => {
	return next({
		flag: true,
	});
});

export const handler = async (ctx: ApiHandlerContext) => ctx.response.json({});
