import { eco } from '@ecopages/core';
import type { Error404TemplateProps } from '@ecopages/core';
import type { ReactNode } from 'react';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page<Error404TemplateProps, ReactNode>({
	dependencies: {
		stylesheets: ['./404.css'],
		components: [BaseLayout],
	},

	render: () => {
		return (
			<BaseLayout>
				<div className="error404">
					<h1>404</h1>
					<p>Page Not Found</p>
					<a href="/">← Back to Home</a>
				</div>
			</BaseLayout>
		);
	},
});
