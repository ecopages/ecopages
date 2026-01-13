import { eco } from '@ecopages/core';
import { DocsLayout } from '@/layouts/docs-layout';
import type { Error404TemplateProps } from '@ecopages/core';

export default eco.page<Error404TemplateProps>({
	dependencies: {
		stylesheets: ['./404.css'],
		components: [DocsLayout],
	},

	render: () => {
		return (
			<DocsLayout>
				<div class="error404">
					<div class="error404__content">
						<div class="error404__code" aria-hidden="true">
							404
						</div>
						<h1 class="error404__title">Page Not Found</h1>
						<p class="error404__message">
							We couldn't find the page you're looking for. It might have been moved or deleted.
						</p>
						<div class="error404__actions">
							<a href="/" class="button button--outline">
								Return Home
							</a>
						</div>
					</div>
				</div>
			</DocsLayout>
		);
	},
});
