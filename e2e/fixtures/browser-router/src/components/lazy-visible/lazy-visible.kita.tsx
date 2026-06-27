import { eco } from '@ecopages/core';

export const LazyVisible = eco.component({
	dependencies: {
		scripts: [{ src: './lazy-visible.script.ts', lazy: { 'on:visible': true } }],
	},
	render: () => (
		<div id="lazy-visible-component">
			<p>This component loads its script when visible</p>
		</div>
	),
});
