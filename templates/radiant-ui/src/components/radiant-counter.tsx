import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { Button } from '@/components/ui/button';
import type { RadiantCounterProps } from './radiant-counter.script';

export const RadiantCounter = eco.component<RadiantCounterProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./radiant-counter.css'],
		scripts: [{ src: './radiant-counter.script.ts', lazy: { 'on:interaction': 'mouseenter,focusin' } }],
		components: [Button],
	},
	render: ({ count = 0 }) => (
		<radiant-counter count={count}>
			<Button type="button" variant="ghost" size="sm" data-ref="decrement" aria-label="Decrement">
				-
			</Button>
			<span data-ref="count">{count}</span>
			<Button type="button" variant="ghost" size="sm" data-ref="increment" aria-label="Increment">
				+
			</Button>
		</radiant-counter>
	),
});
