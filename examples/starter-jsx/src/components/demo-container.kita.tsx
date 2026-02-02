import { eco } from '@ecopages/core';

export type DemoContainerProps = {
	children: JSX.Element | JSX.Element[];
};

export const DemoContainer = eco.component<DemoContainerProps>({
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
