import type { Middleware } from '@ecopages/core';

export const reassigned: Middleware = async (ctx, next) => {
	let role = 'guest';
	ctx.locals.role = role;
	role = 'admin';
	return next();
};

export const awaited: Middleware = async (ctx, next) => {
	await log('loading user');
	ctx.locals.user = await getUser();
	return next();
};
