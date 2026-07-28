import { eco } from '@ecopages/core';
import type { Error500TemplateProps } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page<Error500TemplateProps>({
	dependencies: {
		components: [BaseLayout],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'Server Error',
		description: 'An unexpected error occurred while rendering this page.',
	}),

	render: ({ message, stack }) => {
		return (
			<section class="card text-center border-dashed" data-testid="custom-500-page">
				<p class="text-xs font-semibold uppercase tracking-[0.28em] text-rose-600">Custom 500</p>
				<h1 class="font-display text-5xl font-semibold tracking-tight">Something went wrong.</h1>
				<p class="mx-auto max-w-2xl text-lg leading-8 text-muted">
					{message ??
						'This is the semantic 500.kita.tsx page discovered automatically from the pages directory.'}
				</p>
				{stack ? (
					<pre class="mx-auto mt-4 max-h-80 max-w-3xl overflow-x-auto whitespace-pre-wrap rounded-md border border-dashed p-4 text-left text-xs text-muted">
						{stack}
					</pre>
				) : null}
				<div class="flex flex-wrap justify-center gap-3">
					<a href="/" class="button button--primary">
						Go back home
					</a>
				</div>
			</section>
		);
	},
});
