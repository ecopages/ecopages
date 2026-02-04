import { defineGroupHandler } from '@ecopages/core/adapters/bun';
import { authMiddleware } from './auth';

export const dashboardGroup = defineGroupHandler({
	prefix: '/dashboard',
	middleware: [authMiddleware],
	routes: (define) => [
		define({
			path: '/',
			method: 'GET',
			handler: async (ctx) => {
				const { default: DashboardPage } = await import('@/views/dashboard');
				ctx.require('session', () => Response.redirect(new URL('/login', ctx.request.url)));
				return ctx.render(DashboardPage, {});
			},
		}),
	],
});
