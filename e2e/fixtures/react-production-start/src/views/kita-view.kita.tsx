import { eco } from '@ecopages/core';
import { Counter } from '../components/counter.react';

export default eco.page({
	dependencies: { components: [Counter] },
	metadata: () => ({ title: 'Kita view' }),
	render: () => (
		<main>
			<h1>kita-view</h1>
			<Counter />
		</main>
	),
});
