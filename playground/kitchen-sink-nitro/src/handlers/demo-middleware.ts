import crypto from 'node:crypto';
import type { Middleware } from '@ecopages/core';

const defaultFlags = ['semantic-shells', 'explicit-routes', 'request-locals'];

export const requestInfoMiddleware: Middleware = async (ctx, next) => {
	const url = new URL(ctx.request.url);
	const featureFlags = url.searchParams.getAll('flag').filter(Boolean);

	ctx.locals.requestInfo = {
		method: ctx.request.method,
		pathname: url.pathname,
		receivedAt: new Date().toISOString(),
		requestId: crypto.randomUUID().slice(0, 8),
	};
	ctx.locals.featureFlags = featureFlags.length > 0 ? featureFlags : defaultFlags;
	ctx.locals.viewerRole = ctx.request.headers.get('x-kitchen-role') === 'admin' ? 'admin' : 'viewer';

	return next();
};

export const adminOnlyMiddleware: Middleware = async (ctx, next) => {
	ctx.locals.viewerRole = ctx.request.headers.get('x-kitchen-role') === 'admin' ? 'admin' : 'viewer';

	if (ctx.locals.viewerRole !== 'admin') {
		return ctx.response.status(403).json({
			error: 'Admin access required',
			hint: 'Send the x-kitchen-role: admin header to access this grouped handler.',
		});
	}

	return next();
};
