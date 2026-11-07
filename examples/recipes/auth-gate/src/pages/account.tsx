import { eco } from '@ecopages/core';
import { requireSession } from '../lib/session.server';

export default eco.page({
	cache: 'dynamic',
	middleware: [requireSession],
	requires: ['session'],
	metadata: () => ({ title: 'Account', description: 'Redirects visitors who are not signed in.' }),
	render: ({ locals }) => <h1>Account of {locals.session.user}</h1>,
});
