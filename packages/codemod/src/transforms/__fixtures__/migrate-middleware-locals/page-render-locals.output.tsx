import { eco } from '@ecopages/core';
import { auth } from './auth';

export default eco.page({
	cache: 'dynamic',
	middleware: [auth],
	props: ({ locals }) => ({
		sessionUser: locals.session.user,
		theme: locals?.theme,
	}),
	render: ({ sessionUser, theme, params }) => (
		<p>
			{sessionUser} {theme} {String(params?.slug)}
		</p>
	),
});
