import { eco } from '@ecopages/core';

export const LazyButton = eco.component({
	dependencies: {
		lazy: {
			'on:interaction': 'mouseenter,click',
			scripts: ['./lazy-script.ts'],
		},
	},
	render: () => (
		<button id="lazy-trigger" type="button">
			Click to load lazy script
		</button>
	),
});
