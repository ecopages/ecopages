import type { EcoComponent, PageProps } from '@ecopages/core';
import { html } from '@ecopages/core/html';
import { BaseLayout } from '../layouts/base-layout';

const PostcssHmrPage: EcoComponent<PageProps> = () =>
	html`!${BaseLayout({
		class: 'postcss-content',
		children: html`<h1 class="postcss-title">PostCSS HMR Page</h1><p>Processor-owned CSS should hot swap.</p>`,
	})}`;

PostcssHmrPage.config = {
	dependencies: {
		stylesheets: ['./postcss-hmr.css'],
		components: [BaseLayout],
	},
};

export default PostcssHmrPage;