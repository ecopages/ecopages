import crypto from 'node:crypto';
import { createMiddleware } from '@ecopages/core';

const defaultFlags = ['semantic-shells', 'explicit-routes', 'request-locals'];

export const requestInfoMiddleware = createMiddleware(async (ctx, next) => {
	const url = new URL(ctx.request.url);
	const flags = url.searchParams.getAll('flag').filter(Boolean);

	return next({
		requestInfo: {
			method: ctx.request.method,
			pathname: url.pathname,
			receivedAt: new Date().toISOString(),
			requestId: crypto.randomUUID().slice(0, 8),
		},
		featureFlags: flags.length > 0 ? flags : defaultFlags,
		viewerRole: ctx.request.headers.get('x-kitchen-role') === 'admin' ? ('admin' as const) : ('viewer' as const),
	});
});

export const adminOnlyMiddleware = createMiddleware(async (ctx, next) => {
	if (ctx.request.headers.get('x-kitchen-role') !== 'admin') {
		return ctx.response.status(403).json({
			error: 'Admin access required',
			hint: 'Send the x-kitchen-role: admin header to access this grouped handler.',
		});
	}

	return next({ viewerRole: 'admin' as const });
});
