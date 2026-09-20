import { eco } from '@ecopages/core';

type IndexProps = { title: string };

export default eco.page<IndexProps>({
	layout: 'main',
	dependencies: { stylesheets: ['./index.css'] },
	staticPaths: async () => ({ paths: [] }),
	staticProps: async () => ({ props: { title: 'Home' } }),
	metadata: async () => ({ title: 'Home' }),
	render: ({ title }) => <h1>{title}</h1>,
});
