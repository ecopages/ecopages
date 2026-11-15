import { eco } from '@ecopages/core';

export default eco.page({
	staticPaths: async () => ({ paths: [] }),
	staticProps: async () => ({ props: { title: 'Home' } }),
	render: ({ title }) => <h1>{title}</h1>,
});
