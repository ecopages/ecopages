import { eco } from '@ecopages/core';
import { auth } from './auth';

export default eco.page({
	cache: 'dynamic',
	middleware: [auth],
	requires: ['session'],
	render: ({ locals, params }) => (
		<p>
			{locals.session.user} {locals?.theme} {String(params?.slug)}
		</p>
	),
});
