import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';

export const KitaCounter = eco.component<{}, EcoPagesElement>({
	integration: 'kitajs',
	dependencies: {
		stylesheets: ['./integration-counter.css', './kita-counter.css'],
		scripts: [
			{
				src: './kita-counter.script.ts',
				attributes: {
					'data-eco-rerun': 'true',
				},
			},
		],
	},
	render: () => (
		<div class="integration-counter" data-kita-counter data-counter-kind="kita">
			<button class="integration-counter__button" type="button" data-kita-inc>
				+
			</button>
			<span class="integration-counter__value" data-kita-value>
				0
			</span>
		</div>
	),
});
