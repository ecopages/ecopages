import { eco } from '@ecopages/core';
import type { ErrorPageTemplateProps } from '@ecopages/core';
import type { ReactNode } from 'react';
import { BaseLayout } from '../layouts/base-layout.kita';

export default eco.page<ErrorPageTemplateProps, ReactNode>({
	dependencies: {
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
