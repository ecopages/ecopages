import { eco } from '@ecopages/core';
import { Counter } from '../components/counter.react';

export default eco.page({
	dependencies: { components: [Counter] },
	metadata: () => ({ title: 'React island' }),
	render: () => (
		<main>
			<h1>react-island-page</h1>
			<Counter />
		</main>
	),
});
