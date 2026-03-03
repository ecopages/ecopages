import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';

export const KitaCounter = eco.component<{}, EcoPagesElement>({
	integration: 'kitajs',
	dependencies: {
		scripts: ['./kita-counter.script.ts'],
	},
	render: () => (
		<div data-kita-counter>
			<button type="button" data-kita-inc>
				+
			</button>
			<span data-kita-value>0</span>
		</div>
	),
});
