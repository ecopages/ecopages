import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page({
	dependencies: {
		components: [BaseLayout],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'Not Found',
		description: 'The requested page could not be found.',
	}),

	render: () => {
		return (
			<section class="card text-center border-dashed">
				<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Custom 404</p>
				<h1 class="font-display text-5xl font-semibold tracking-tight">The route exists in neither router.</h1>
				<p class="mx-auto max-w-2xl text-lg leading-8 text-muted">
					This is the semantic <span class="font-mono">404.kita.tsx</span> page discovered automatically from
					the pages directory.
				</p>
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
