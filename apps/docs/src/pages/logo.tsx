import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { LogoPlayground } from '@/components/logo-playground';
import type { JsxRenderable } from '@ecopages/jsx/jsx-runtime';

export default eco.page<{}, JsxRenderable>({
	dependencies: {
		stylesheets: ['./logo.css'],
		components: [LogoPlayground],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'Logo Playground',
		description: 'Interactive playground for the Ecopages logo system.',
		image: 'public/assets/images/default-og.png',
		keywords: ['ecopages', 'logo', 'branding', 'svg'],
	}),

	render: () => {
		return (
			<main class="logo-lab">
				<div class="logo-lab__intro">
					<h1 class="logo-lab__title">Logo Playground</h1>
					<p class="logo-lab__copy">
						Dial in the badge or wordmark treatment, switch surface tone, and export the current SVG.
					</p>
				</div>

				<LogoPlayground />
			</main>
		);
	},
});
