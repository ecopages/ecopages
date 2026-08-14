import type { PageProps } from '@ecopages/core';
import { eco } from '@ecopages/core';
import { BaseLayout } from '../layouts/base-layout';

export default eco.page<PageProps>({
	dependencies: {
		stylesheets: ['./postcss-hmr.css'],
		components: [BaseLayout],
	},
	render: () =>
		`${BaseLayout({
			class: 'postcss-content',
			children: `<h1 class="postcss-title">PostCSS HMR Page</h1>
				<p>Processor-owned CSS should hot swap.</p>`,
		})}`,
});
