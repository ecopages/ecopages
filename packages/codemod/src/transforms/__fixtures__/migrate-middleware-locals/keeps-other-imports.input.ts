import { createMiddleware, type Middleware, type ApiHandlerContext } from '@ecopages/core';

export const stage: Middleware = async (ctx, next) => {
	ctx.locals.flag = true;
	return next();
};

export const handler = async (ctx: ApiHandlerContext) => ctx.response.json({});
