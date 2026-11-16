import { eco } from '@ecopages/core';
import { auth } from './auth';
import { Nav } from './nav';
export default eco.page({
	cache: 'dynamic',
	middleware: [auth],
	render: ({ locals }) => <Nav user={locals.session.user} />,
});
