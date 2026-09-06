import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import type { RadiantCounterProps } from './radiant-counter.script';
import './radiant-counter.css';

export const RadiantCounter = eco.component<RadiantCounterProps, JsxRenderable>({
	dependencies: {
		scripts: [{ src: './radiant-counter.script.ts', lazy: { 'on:interaction': 'mouseenter,focusin' } }],
	},
	render: ({ count = 0 }) => (
		<radiant-counter count={count}>
			<RuiButton type="button" variant="ghost" size="sm" data-ref="decrement" aria-label="Decrement">
				-
			</RuiButton>
			<span data-ref="count">{count}</span>
			<RuiButton type="button" variant="ghost" size="sm" data-ref="increment" aria-label="Increment">
				+
			</RuiButton>
		</radiant-counter>
	),
});
