import { eco } from '@ecopages/core';
import { requireSession } from '../lib/session.server';

export default eco.page({
	cache: 'dynamic',
	middleware: [requireSession],
	metadata: () => ({ title: 'Account', description: 'Redirects visitors who are not signed in.' }),
	props: ({ locals }) => ({ user: locals.session.user }),
	render: ({ user }) => <h1>Account of {user}</h1>,
});
