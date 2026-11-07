import { eco } from '@ecopages/core';
import { AuthGate } from '../layouts/auth-gate';
import { loadSession } from '../lib/session.server';

export default eco.page({
	layout: AuthGate,
	cache: 'dynamic',
	middleware: [loadSession],
	metadata: () => ({ title: 'Dashboard', description: 'Visible to signed-in visitors.' }),
	render: () => <h1>Dashboard</h1>,
});
