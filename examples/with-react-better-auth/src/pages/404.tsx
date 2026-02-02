import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page({
	layout: BaseLayout,
	metadata: () => ({
		title: 'Page not found',
		description: 'The page you requested could not be found.',
	}),
	render: () => (
		<div className="mx-auto max-w-2xl text-center">
			<h1 className="text-4xl font-bold tracking-tight text-on-background">Page not found</h1>
			<p className="mt-4 text-muted">The page you requested could not be found.</p>
			<p className="mt-6">
				<a href="/" className="btn btn-primary">
					Back to home
				</a>
			</p>
		</div>
	),
});
