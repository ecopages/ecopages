import { eco } from '@ecopages/core';

export default eco.page({
	cache: 'dynamic',
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
