import { eco } from '@ecopages/core';

export const LazyButton = eco.component({
	dependencies: {
		scripts: [{ src: './lazy-script.ts', lazy: { 'on:interaction': 'mouseenter,click' } }],
	},
	render: () => (
		<button id="lazy-trigger" type="button">
			Click to load lazy script
		</button>
	),
});
