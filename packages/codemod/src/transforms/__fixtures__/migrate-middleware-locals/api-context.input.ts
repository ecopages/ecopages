import type { Middleware } from '@ecopages/core';

export const readsQuery: Middleware = async (ctx, next) => {
	ctx.locals.tab = ctx.query.tab ?? 'home';
	return next();
};

export const rendersView: Middleware = async (ctx, next) => {
	ctx.locals.flag = true;
	if (ctx.request.method === 'HEAD') return ctx.render(View);
	return next();
};
