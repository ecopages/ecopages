import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout.kita';
import { LazyButton } from '@/components/lazy-button/lazy-button.kita';
import { LazyVisible } from '@/components/lazy-visible/lazy-visible.kita';
import { LazyIdle } from '@/components/lazy-idle/lazy-idle.kita';

export default eco.page({
	layout: BaseLayout,

	dependencies: {
		components: [LazyButton, LazyVisible, LazyIdle],
	},

	metadata: () => ({
		title: 'Lazy Dependencies Test',
		description: 'E2E test page for lazy dependency loading',
	}),

	render: () => {
		return (
			<main data-testid="lazy-deps-page">
				<h1>Lazy Dependencies Test</h1>

				<section>
					<h2>on:interaction (click)</h2>
					<p>Click the button below to trigger lazy script loading:</p>
					<LazyButton />
				</section>

				<section>
					<h2>on:idle</h2>
					<p>This script loads when the browser is idle:</p>
					<LazyIdle />
				</section>

				<div style="height: 1500px; background: linear-gradient(to bottom, #f0f0f0, #ffffff);">
					<p>Scroll down to see the on:visible component</p>
				</div>

				<section id="below-fold-section">
					<h2>on:visible</h2>
					<p>This script loads when the component enters the viewport:</p>
					<LazyVisible />
				</section>
			</main>
		);
	},
});
