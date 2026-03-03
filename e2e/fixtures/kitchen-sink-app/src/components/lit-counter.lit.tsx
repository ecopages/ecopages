import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';

export const LitCounter = eco.component<{}, EcoPagesElement>({
	integration: 'lit',
	dependencies: {
		scripts: ['./lit-counter.script.ts'],
	},
	render: () => (
		<div data-lit-counter>
			<button type="button" data-lit-inc>
				+
			</button>
			<span data-lit-value>0</span>
		</div>
	),
});
