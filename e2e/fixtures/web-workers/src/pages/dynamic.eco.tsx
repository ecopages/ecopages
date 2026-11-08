/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import { WorkerDemo } from '../components/worker-demo.eco';

export default eco.page({
	cache: 'dynamic',
	metadata: () => ({ title: 'Web workers on a dynamic Page' }),
	dependencies: { components: [WorkerDemo] },
	render: () => (
		<main>
			<WorkerDemo />
		</main>
	),
});
