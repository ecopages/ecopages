import type { EcoComponent, Error404TemplateProps } from '@ecopages/core';
import type { JSX } from 'react';
import { BaseLayout } from '@/layouts/base-layout';

const Error404: EcoComponent<Error404TemplateProps, JSX.Element> = () => {
	return (
		<BaseLayout>
			<div className="error404">
				<h1>404</h1>
				<p>Page Not Found</p>
				<a href="/">← Back to Home</a>
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
