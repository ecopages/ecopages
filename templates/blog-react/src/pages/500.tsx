import { eco } from '@ecopages/core';
import type { ErrorPageTemplateProps } from '@ecopages/core';
import type { ReactNode } from 'react';
import { BaseLayout } from '@/layouts/base-layout';
import './500.css';

export default eco.page<ErrorPageTemplateProps, ReactNode>({
	layout: BaseLayout,

	render: ({ message, stack }) => {
		return (
			<div className="error500">
				<h1>500 - Internal Server Error</h1>
				<p>{message ?? 'Something went wrong while rendering this page.'}</p>
				{stack ? <pre className="error500__stack">{stack}</pre> : null}
			</div>
		);
	},
});
