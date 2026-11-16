import { eco } from '@ecopages/core';
import { auth } from './auth';
import { Nav } from './nav';
export default eco.page({
	cache: 'dynamic',
	middleware: [auth],

	props: ({ locals }) => ({
		sessionUser: locals.session.user,
	}),

	render: ({ sessionUser }) => <Nav user={sessionUser} />,
});
