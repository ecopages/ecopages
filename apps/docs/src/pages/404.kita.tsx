import { BaseLayout } from '@/layouts/base-layout';
import type { EcoComponent, Error404TemplateProps } from '@ecopages/core';

const Error404: EcoComponent<Error404TemplateProps> = () => {
	return (
		<BaseLayout>
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
		</BaseLayout>
	);
};

Error404.config = {
	dependencies: {
		stylesheets: ['./404.css'],
		components: [BaseLayout],
	},
};

export default Error404;
