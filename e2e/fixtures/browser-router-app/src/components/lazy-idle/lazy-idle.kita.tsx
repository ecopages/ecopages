import { eco } from '@ecopages/core';

export const LazyIdle = eco.component({
	dependencies: {
		lazy: {
			'on:idle': true,
			scripts: ['./lazy-idle.script.ts'],
		},
	},
	render: () => (
		<div id="lazy-idle-component">
			<p>This component loads its script when browser is idle</p>
		</div>
	),
});
