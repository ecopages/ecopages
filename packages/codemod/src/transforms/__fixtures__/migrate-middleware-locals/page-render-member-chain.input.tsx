import { eco } from '@ecopages/core';
import { Nav } from './nav';
export default eco.page({
	cache: 'dynamic',
	render: ({ locals }) => <Nav user={locals.session.user} />,
});
