import { eco } from '@ecopages/core';
import { ShellLayout } from '../layouts/shell-layout';
import { requireSession } from '../lib/auth.server';

export default eco.page({
	cache: 'dynamic',
	middleware: [requireSession],
	metadata: () => ({ title: 'Dashboard', description: 'Your workspace dashboard.' }),
	requires: ['workspace'] as const,
	layout: { component: ShellLayout, props: () => ({ workspace: { current: '/dashboard', title: 'Dashboard' } }) },
	render: () => null,
});
