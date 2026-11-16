import { eco } from '@ecopages/core';
import { Nav } from './nav';
export default eco.page({
	cache: 'dynamic',

	props: ({ locals }) => ({
		sessionUser: locals.session.user,
	}),

	render: ({ sessionUser }) => <Nav user={sessionUser} />,
});
