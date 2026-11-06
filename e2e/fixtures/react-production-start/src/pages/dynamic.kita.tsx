import { eco } from '@ecopages/core';
import { Counter } from '../components/counter.react';

export default eco.page({
	cache: 'dynamic',
	dependencies: { components: [Counter] },
	metadata: () => ({ title: 'React island on a dynamic Page' }),
	render: () => (
		<main>
			<h1>react-island-dynamic-page</h1>
			<Counter />
		</main>
	),
});
