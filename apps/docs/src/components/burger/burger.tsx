import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

export const Burger = eco.component<{ class?: string }, JsxRenderable>({
	dependencies: {
		stylesheets: ['./burger.css'],
		scripts: [{ src: './burger.script.ts', ssr: true }],
	},
	render: ({ class: className }) => {
		return (
			<radiant-burger class={className}>
				<button type="button" class="burger" aria-label="Toggle Navigation">
					<span class="burger__line"></span>
					<span class="burger__line"></span>
					<span class="burger__line"></span>
				</button>
			</radiant-burger>
		);
	},
});
