import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';

export const ReactCounterStatic = eco.component<{}, EcoPagesElement>({
	integration: 'kitajs',
	dependencies: {
		stylesheets: ['./integration-counter.css', './react-counter.css'],
		scripts: [
			{
				src: './react-counter.script.ts',
				attributes: {
					'data-eco-rerun': 'true',
				},
			},
		],
	},
	render: () => (
		<div class="integration-counter" data-react-counter>
			<button class="integration-counter__button" type="button" data-react-inc>
				+
			</button>
			<span class="integration-counter__value" data-react-value>
				0
			</span>
		</div>
	),
});
