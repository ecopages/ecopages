import { eco } from '@ecopages/core';

export default eco.page({
	paths: async () => [],
	props: async () => ({
		title: 'Home',
	}),
	render: ({ title }) => <h1>{title}</h1>,
});
