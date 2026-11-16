import { eco } from '@ecopages/core';
import { Nav } from './nav';
export const Whole = eco.page({
	cache: 'dynamic',
	render: ({ locals }) => <Nav locals={locals} />,
});

export const Computed = eco.page({
	cache: 'dynamic',
	render: ({ locals }) => <Nav user={locals.session['user']} />,
});

export const Spread = eco.page({
	cache: 'dynamic',
	render: ({ locals }) => <Nav {...locals.session} />,
});

export const Method = eco.page({
	cache: 'dynamic',
	render: ({ locals }) => <Nav user={locals.session.get('user')} />,
});

export const RouteParams = eco.page({
	cache: 'dynamic',
	render: ({ locals }) => <Nav id={locals.params.id} />,
});

export const RouteQuery = eco.page({
	cache: 'dynamic',
	render: ({ locals }) => <Nav q={locals.query} />,
});

export const SameName = eco.page({
	cache: 'dynamic',
	render: ({ locals }) => <Nav a={locals.sessionUser} b={locals.session.user} />,
});

export const NameInUse = eco.page({
	cache: 'dynamic',
	render: ({ locals }) => {
		const sessionUser = 'x';
		return <Nav a={locals.session.user} b={sessionUser} />;
	},
});

export const Destructured = eco.page({
	cache: 'dynamic',
	render: ({ locals }) => {
		const { user } = locals.session;
		return <Nav user={user} />;
	},
});
