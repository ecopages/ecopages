import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout.kita';

export default eco.page({
	layout: BaseLayout,

	dependencies: {
		scripts: ['../../layouts/base-layout.script.ts'],
	},

	metadata: () => ({
		title: 'Prefetch Tests',
		description: 'E2E test page for browser router prefetch strategies',
	}),

	render: () => {
		return (
			<>
				<h1>Prefetch Strategy Tests</h1>
				<p>Test pages for E2E prefetch testing</p>

				<nav>
					<ul>
						<li>
							<a href="/prefetch/destination?test=eager" data-eco-prefetch="eager" id="link-eager">
								Eager Prefetch
							</a>
						</li>
						<li>
							<a href="/prefetch/destination?test=hover" data-eco-prefetch="hover" id="link-hover">
								Hover Prefetch
							</a>
						</li>
						<li>
							<a
								href="/prefetch/destination?test=viewport"
								data-eco-prefetch="viewport"
								id="link-viewport"
							>
								Viewport Prefetch
							</a>
						</li>
						<li>
							<a href="/prefetch/destination?test=intent" data-eco-prefetch="intent" id="link-intent">
								Intent Prefetch
							</a>
						</li>
						<li>
							<a
								href="/prefetch/destination?test=delay"
								data-eco-prefetch="hover"
								data-eco-prefetch-delay="500"
								id="link-custom-delay"
							>
								Custom Delay (500ms)
							</a>
						</li>
						<li>
							<a href="/prefetch/destination?test=none" data-eco-no-prefetch id="link-no-prefetch">
								No Prefetch
							</a>
						</li>
					</ul>
				</nav>

				<div style="height: 2000px; background: linear-gradient(to bottom, #f0f0f0, #ffffff);"></div>

				<div id="below-fold">
					<h2>Below the Fold</h2>
					<a href="/prefetch/destination?test=below" data-eco-prefetch="viewport" id="link-below-fold">
						Below Fold Link
					</a>
				</div>
			</>
		);
	},
});
