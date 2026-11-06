import { eco } from '@ecopages/core';

export default eco.page({
	cache: 'dynamic',
	metadata: () => ({ title: 'Boom' }),
	render: () => {
		throw new Error('boom');
	},
});
