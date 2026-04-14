/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import type { RadiantCounterProps } from './radiant-counter-element.script';

type EcopagesJsxRadiantCounterProps = RadiantCounterProps & {
	id?: string;
};

export const RadiantCounterComponent = eco.component<EcopagesJsxRadiantCounterProps, JsxRenderable>({
	integration: 'ecopages-jsx',
	dependencies: {
		stylesheets: ['./integration-counter.css', './radiant-counter.css'],
		scripts: [{ src: './radiant-counter-element.script.ts' }],
	},
	render: ({ id = '', value = 0 }) => (
		<radiant-counter id={id || undefined} data-radiant-counter data-counter-kind="radiant" value={value}>
			<button
				class="integration-counter__button"
				type="button"
				data-ref="increment"
				data-radiant-inc
				aria-label="Increment"
			>
				+
			</button>
			<span class="integration-counter__value" data-ref="count" data-radiant-value>
				{value}
			</span>
		</radiant-counter>
	),
});
