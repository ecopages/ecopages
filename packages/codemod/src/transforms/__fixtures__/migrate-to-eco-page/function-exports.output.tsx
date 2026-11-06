import { eco } from '@ecopages/core';

export default eco.page({
	staticPaths: async function () {
		return { paths: [] };
	},

	staticProps: async function () {
		return { props: { title: 'Home' } };
	},

	metadata: function () {
		return { title: 'Home' };
	},

	render: () => <h1>Home</h1>,
});
