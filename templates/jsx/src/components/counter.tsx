import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

export type CounterProps = {
	count?: number;
};

export const Counter = eco.component<CounterProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./counter.css'],
		scripts: [{ src: './counter.script.ts', lazy: { 'on:interaction': 'mouseenter,focusin' } }],
	},

	render: ({ count = 0 }) => (
		<demo-counter count={count}>
			<button type="button" data-ref="decrement" aria-label="Decrement">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="pointer-events-none"
				>
					<path d="M5 12h14" />
				</svg>
			</button>
			<span data-ref="count">{count}</span>
			<button type="button" data-ref="increment" aria-label="Increment">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="pointer-events-none"
				>
					<path d="M5 12h14" />
					<path d="M12 5v14" />
				</svg>
			</button>
		</demo-counter>
	),
});
