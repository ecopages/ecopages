import { eco } from '@ecopages/core';

export const LazyVisible = eco.component({
	dependencies: {
		lazy: {
			'on:visible': true,
			scripts: ['./lazy-visible.script.ts'],
		},
	},
	render: () => (
		<div id="lazy-visible-component">
			<p>This component loads its script when visible</p>
		</div>
	),
});
