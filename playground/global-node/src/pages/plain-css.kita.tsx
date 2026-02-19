import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page({
	dependencies: {
		stylesheets: ['./plain-css.css'],
		components: [BaseLayout],
	},

	metadata: () => ({
		title: 'Home page',
		description: 'This is the homepage of the website',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	}),

	render: () => {
		return (
			<BaseLayout>
				<h1 class="title">Home</h1>
				<p class="description">
					This page is styled with plain CSS. You can find the styles in <code>plain-css.css</code>.
				</p>
			</BaseLayout>
		);
	},
});
