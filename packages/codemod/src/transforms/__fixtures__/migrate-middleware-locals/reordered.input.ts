import type { Middleware } from '@ecopages/core';

export const auditsContext: Middleware = async (ctx, next) => {
	ctx.locals.user = await getUser();
	await audit(ctx);
	return next();
};

export const destructuredLocals: Middleware = async (ctx, next) => {
	const { locals } = ctx;
	ctx.locals.user = 'x';
	if (!locals.user) return new Response(null, { status: 401 });
	return next();
};

export const helperReadsContext: Middleware = async (ctx, next) => {
	const check = () => audit(ctx);
	ctx.locals.user = 'x';
	check();
	return next();
};
