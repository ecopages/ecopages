import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { DashboardContent } from '@/components/dashboard-content';
import { ReactNode } from 'react';

type User = {
	id: string;
	name: string | null;
	email: string;
};

export default eco.page<{ user: User }, ReactNode>({
	layout: BaseLayout,
	dependencies: {
		components: [DashboardContent],
	},
	metadata: () => ({
		title: 'Dashboard',
		description: 'Your account dashboard.',
	}),
	render: ({ user }) => (
		<>
			<h1 className="text-3xl font-bold tracking-tight text-[var(--color-on-background)]">Dashboard</h1>
			<DashboardContent user={user} />
		</>
	),
});
