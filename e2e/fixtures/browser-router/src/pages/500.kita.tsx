import { eco } from '@ecopages/core';
import type { ErrorPageTemplateProps } from '@ecopages/core';
import type { ReactNode } from 'react';
import { BaseLayout } from '../layouts/base-layout.kita';

export default eco.page<ErrorPageTemplateProps, ReactNode>({
	dependencies: {
		components: [BaseLayout],
	},

	render: ({ message, stack }) => {
		return (
			<BaseLayout>
				<div class="error500">
					<h1>500 - Internal Server Error</h1>
					<p>{message ?? 'Something went wrong while rendering this page.'}</p>
					{stack ? <pre class="error500__stack">{stack}</pre> : null}
				</div>
			</BaseLayout>
		);
	},
});
