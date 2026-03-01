import { eco } from '@ecopages/core';

export const LazyIdle = eco.component({
	dependencies: {
		scripts: [{ src: './lazy-idle.script.ts', lazy: { 'on:idle': true } }],
	},
	render: () => (
		<div id="lazy-idle-component">
			<p>This component loads its script when browser is idle</p>
		</div>
	),
});
