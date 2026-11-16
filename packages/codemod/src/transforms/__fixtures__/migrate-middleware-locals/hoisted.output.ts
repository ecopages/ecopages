import { createMiddleware } from '@ecopages/core';

export const reassigned = createMiddleware(async (ctx, next) => {
	let role = 'guest';
	const role2 = role;
	role = 'admin';
	return next({
		role: role2,
	});
});

export const awaited = createMiddleware(async (ctx, next) => {
	const user = await getUser();
	await log('user loaded');
	return next({
		user,
	});
});
