import { eco } from '@ecopages/core';
import { workspaceLayout } from '../layouts/shell-layout';
import { requireSession } from '../lib/auth.server';

export default eco.page({
	cache: 'dynamic',
	middleware: [requireSession],
	metadata: () => ({ title: 'Dashboard', description: 'Your workspace dashboard.' }),
	layout: workspaceLayout({ current: '/dashboard', title: 'Dashboard' }),
	render: () => null,
});
