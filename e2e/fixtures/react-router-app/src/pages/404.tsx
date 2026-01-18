import { eco } from '@ecopages/core';
import type { Error404TemplateProps } from '@ecopages/core';
import type { ReactNode } from 'react';
import { BaseLayout } from '../layouts/base-layout';

export default eco.page<Error404TemplateProps, ReactNode>({
	dependencies: {
		components: [BaseLayout],
	},

	render: () => {
		return (
			<BaseLayout>
				<div className="error404">
					<h1>404 - Page Not Found</h1>
					<p>The page you are looking for does not exist.</p>
				</div>
			</BaseLayout>
		);
	},
});
