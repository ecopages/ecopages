/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import { WorkerDemo } from '../components/worker-demo.eco';

export default eco.page({
	metadata: () => ({ title: 'Web workers' }),
	dependencies: { components: [WorkerDemo] },
	render: () => (
		<main>
			<WorkerDemo />
		</main>
	),
});
