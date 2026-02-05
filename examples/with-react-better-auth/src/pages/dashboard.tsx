import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { DashboardContent } from '@/components/dashboard-content';
import { ReactNode } from 'react';
import { authMiddleware } from '@/handlers/auth.server';

export default eco.page<{}, ReactNode>({
	layout: BaseLayout,
	cache: 'dynamic',
	dependencies: {
		components: [DashboardContent],
	},
	middleware: [authMiddleware],
	requires: ['session'] as const,
	metadata: () => ({
		title: 'Dashboard',
		description: 'Your account dashboard.',
	}),
	render: ({ locals }) => {
		const user = locals?.session?.user;
		if (!user) {
			return (
				<>
					<h1 className="text-3xl font-bold tracking-tight text-(--color-on-background)">Dashboard</h1>
					<p className="mt-2 text-(--color-muted)">
						No active session. <a href="/login">Sign in</a>
					</p>
				</>
			);
		}
		return (
			<>
				<h1 className="text-3xl font-bold tracking-tight text-(--color-on-background)">Dashboard</h1>
				<DashboardContent user={user} />
			</>
		);
	},
});
