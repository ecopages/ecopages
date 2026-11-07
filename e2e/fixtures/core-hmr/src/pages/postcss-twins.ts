import type { PageProps } from '@ecopages/core';
import { eco } from '@ecopages/core';
import { BaseLayout } from '../layouts/base-layout';

export default eco.page<PageProps>({
	dependencies: {
		stylesheets: ['./postcss-twins/a/style.css', './postcss-twins/b/style.css'],
		components: [BaseLayout],
	},
	render: () =>
		`${BaseLayout({
			children: `<p class="twin-a">Twin A</p>
				<p class="twin-b">Twin B</p>`,
		})}`,
});
