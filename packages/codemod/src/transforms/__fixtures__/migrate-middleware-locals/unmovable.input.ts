import type { Middleware } from '@ecopages/core';

export const branching: Middleware = async (ctx, next) => {
	if (ctx.request.method === 'GET') {
		ctx.locals.mode = 'read';
	}
	return next();
};

export const twoCalls: Middleware = async (ctx, next) => {
	ctx.locals.a = 1;
	if (ctx.request.method === 'GET') {
		return next();
	}
	return next();
};

export const guardReadsLocals: Middleware = async (ctx, next) => {
	ctx.locals.role = 'admin';
	if (ctx.locals.role !== 'admin') {
		return new Response(null, { status: 403 });
	}
	return next();
};
