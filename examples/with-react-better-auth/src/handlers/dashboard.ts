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
				return ctx.render(DashboardPage, { user: ctx.session.user });
			},
		}),
	],
});
