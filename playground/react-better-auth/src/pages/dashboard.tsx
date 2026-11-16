import { eco } from '@ecopages/core';
import { authenticatedLayout } from '@/layouts/base-layout';
import { DashboardContent } from '@/components/dashboard-content';
import { authMiddleware } from '@/handlers/auth.server';

export default eco.page({
	layout: authenticatedLayout,
	cache: 'dynamic',
	middleware: [authMiddleware],
	requires: ['user'] as const,
	metadata: () => ({
		title: 'Dashboard',
		description: 'Your account dashboard.',
	}),
	render: ({ locals }) => {
		const user = locals.user;
		return (
			<>
				<h1 className="text-3xl font-bold tracking-tight text-(--color-on-background)">Dashboard</h1>
				<DashboardContent user={user} />
			</>
		);
	},
});
