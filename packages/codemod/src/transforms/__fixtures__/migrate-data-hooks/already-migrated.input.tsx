import { eco } from '@ecopages/core';

export default eco.page({
	paths: async () => [{ params: { slug: 'a' } }],
	props: async () => ({ title: 'A' }),
	render: ({ title }) => <h1>{title}</h1>,
});
