import { eco } from '@ecopages/core';
import type { Error500TemplateProps } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page<Error500TemplateProps>({
	layout: BaseLayout,
	metadata: () => ({
		title: 'Server error',
		description: 'Something went wrong while rendering this page.',
	}),
	render: ({ message, stack }) => (
		<div className="mx-auto max-w-2xl text-center">
			<h1 className="text-4xl font-bold tracking-tight text-on-background">Server error</h1>
			<p className="mt-4 text-muted">{message ?? 'Something went wrong while rendering this page.'}</p>
			{stack ? (
				<pre className="mt-6 overflow-auto rounded-lg bg-on-background/5 p-4 text-left text-xs font-mono text-on-background/70 whitespace-pre-wrap">
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
