import { eco } from '@ecopages/core';

export default eco.page({
	cache: 'dynamic',
	requires: ['session'],
	render: ({ locals, params }) => (
		<p>
			{locals.session.user} {locals?.theme} {String(params?.slug)}
		</p>
	),
});
