import { eco } from '@ecopages/core';
import type { ErrorPageTemplateProps } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import './500.css';

export default eco.page<ErrorPageTemplateProps>({
	layout: BaseLayout,

	render: ({ message, stack }) => {
		return (
			<div class="error500">
				<h1>500 - Internal Server Error</h1>
				<p>{message ?? 'Something went wrong while rendering this page.'}</p>
				{stack ? <pre class="error500__stack">{stack}</pre> : null}
			</div>
		);
	},
});
