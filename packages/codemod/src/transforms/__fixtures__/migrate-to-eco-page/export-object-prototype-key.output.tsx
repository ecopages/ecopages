import { eco } from '@ecopages/core';

type IndexProps = { title: string };

export const toString = () => 'keep-me';

export default eco.page<IndexProps>({
	layout: 'main',
	staticPaths: async () => ({ paths: [] }),
	render: () => <h1>Home</h1>,
});
