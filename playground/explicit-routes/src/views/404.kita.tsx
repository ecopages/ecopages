import { eco } from '@ecopages/core';
import type { Error404TemplateProps } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout/base-layout.kita';

export default eco.page<Error404TemplateProps>({
	dependencies: {
		stylesheets: ['./404.css'],
		components: [BaseLayout],
	},

	render: () => {
		return (
			<BaseLayout>
				<div class="error404">
					<h1>404 - Page Not Found</h1>
					<p>The page you are looking for does not exist.</p>
				</div>
			</BaseLayout>
		);
	},
});
