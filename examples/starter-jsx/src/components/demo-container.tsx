import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

export type DemoContainerProps = {
	children: JsxRenderable;
};

export const DemoContainer = eco.component<DemoContainerProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./demo-container.css'],
	},
	render: ({ children }) => {
		return (
			<div class="demo-container">
				<div class="demo-hero">
					<h1 class="demo-title">ecopages</h1>
					<p class="demo-subtitle">Build faster with islands and MDX.</p>
				</div>

				<div class="demo-grid">{children}</div>
			</div>
		);
	},
});
