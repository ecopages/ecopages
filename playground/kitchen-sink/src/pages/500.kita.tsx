import { eco } from '@ecopages/core';
import type { Error500TemplateProps } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { getPageTestId } from '@/data/primary-links';

export default eco.page<Error500TemplateProps>({
	dependencies: {
		components: [BaseLayout],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'Server Error',
		description: 'Something went wrong while rendering this page.',
	}),

	render: ({ message, stack }) => {
		return (
			<section class="card text-center border-dashed" data-testid={getPageTestId('/server-error')}>
				<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Custom 500</p>
				<h1 class="font-display text-5xl font-semibold tracking-tight">
					The render path failed, but the fallback page did not.
				</h1>
				<p class="mx-auto max-w-2xl text-lg leading-8 text-muted">
					{message ??
						'This is the semantic 500.kita.tsx page discovered automatically from the pages directory.'}
				</p>
				{stack ? (
					<pre class="mx-auto mt-6 max-h-64 max-w-3xl overflow-auto rounded-lg bg-sky-950/5 p-4 text-left text-xs font-mono text-muted whitespace-pre-wrap">
						{stack}
					</pre>
				) : null}
				<div class="flex flex-wrap justify-center gap-3">
					<a href="/" class="button button--primary">
						Go back home
					</a>
					<a href="/explicit/team" class="button button--secondary">
						Try an explicit route
					</a>
				</div>
			</section>
		);
	},
});
