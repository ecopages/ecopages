import { eco } from '@ecopages/core';
import type { Error500TemplateProps } from '@ecopages/core';
import type { ReactNode } from 'react';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page<Error500TemplateProps, ReactNode>({
	dependencies: {
		stylesheets: ['./500.css'],
		components: [BaseLayout],
	},

	render: ({ message, stack }) => {
		return (
			<BaseLayout>
				<div className="error500">
					<h1>500 - Internal Server Error</h1>
					<p>{message ?? 'Something went wrong while rendering this page.'}</p>
					{stack ? <pre className="error500__stack">{stack}</pre> : null}
				</div>
			</BaseLayout>
		);
	},
});
