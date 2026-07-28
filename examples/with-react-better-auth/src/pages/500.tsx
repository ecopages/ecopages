import { eco } from '@ecopages/core';
import type { Error500TemplateProps } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page<Error500TemplateProps>({
	layout: BaseLayout,
	metadata: () => ({
		title: 'Something went wrong',
		description: 'An unexpected error occurred while rendering this page.',
	}),
	render: ({ message, stack }) => (
		<div className="mx-auto max-w-2xl text-center">
			<h1 className="text-4xl font-bold tracking-tight text-on-background">Something went wrong</h1>
			<p className="mt-4 text-muted">{message ?? 'An unexpected error occurred while rendering this page.'}</p>
			{stack ? (
				<pre className="mt-6 overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-4 text-left text-xs text-muted">
					{stack}
				</pre>
			) : null}
			<p className="mt-6">
				<a href="/" className="btn btn-primary">
					Back to home
				</a>
			</p>
		</div>
	),
});
