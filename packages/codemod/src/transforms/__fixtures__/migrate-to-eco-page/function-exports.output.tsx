import { eco } from '@ecopages/core';

export default eco.page({
	paths: async function () {
		return [];
	},

	props: async function () {
		return { title: 'Home' };
	},

	metadata: function () {
		return { title: 'Home' };
	},

	render: () => <h1>Home</h1>,
});
