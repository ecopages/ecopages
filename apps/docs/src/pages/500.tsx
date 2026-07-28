import { eco } from '@ecopages/core';
import { DocsLayout } from '@/layouts/docs-layout';
import type { Error500TemplateProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

export default eco.page<Error500TemplateProps, JsxRenderable>({
	layout: DocsLayout,
	dependencies: {
		stylesheets: ['./500.css'],
	},

	render: ({ message, stack }) => {
		return (
			<div class="error500">
				<div class="error500__content">
					<div class="error500__code" aria-hidden="true">
						500
					</div>
					<h1 class="error500__title">Something went wrong</h1>
					<p class="error500__message">
						{message ?? 'An unexpected error occurred while rendering this page.'}
					</p>
					{stack ? <pre class="error500__stack">{stack}</pre> : null}
					<div class="error500__actions">
						<a href="/" class="button button--outline">
							Return Home
						</a>
					</div>
				</div>
			</div>
		);
	},
});
