import { eco } from '@ecopages/core';

export default eco.page({
	metadata: () => ({ title: 'WebAssembly threads', description: 'Shared memory between the page and a Worker.' }),
	dependencies: { scripts: ['../lib/start-counter.ts'] },
	render: () => (
		<main>
			<h1>WebAssembly threads</h1>
			<output data-result>waiting</output>
		</main>
	),
});
