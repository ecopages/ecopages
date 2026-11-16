import { eco } from '@ecopages/core';

export default eco.page({
	cache: 'dynamic',
	props: async () => ({ title: 'Account' }),
	requires: ['session'],
	render: ({ title, locals }) => (
		<p>
			{title} {locals.session.user}
		</p>
	),
});

export const Aliased = eco.page({
	cache: 'dynamic',
	render: (props) => <p>{props.locals.session.user}</p>,
});
