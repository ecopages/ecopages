import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';

export const KitaCounter = eco.component<{}, EcoPagesElement>({
	integration: 'kitajs',
	dependencies: {
		scripts: ['./kita-counter.script.ts'],
	},
	render: () => (
		<div class="integration-counter" data-kita-counter>
			<button class="integration-counter__button" type="button" data-kita-inc>
				+
			</button>
			<span class="integration-counter__value" data-kita-value>0</span>
		</div>
	),
});