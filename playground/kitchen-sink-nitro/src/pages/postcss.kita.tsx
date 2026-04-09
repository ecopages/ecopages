import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout/base-layout.kita';

export default eco.page({
	dependencies: {
		components: [BaseLayout],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'PostCSS Test',
		description: 'A test page mixing BEM tailwind components with inline tailwind utilities.',
	}),
	render: () => {
		return (
			<div class="space-y-10">
				<section class="section--featured border-dashed border-sky-400">
					<div class="space-y-5">
						<p class="text-sm font-semibold uppercase tracking-[0.28em] text-fuchsia-500">
							PostCSS Validation
						</p>
						<h2 class="font-display text-4xl font-semibold tracking-tight lg:text-5xl">
							Testing inline and component BEM classes.
						</h2>
						<p class="max-w-2xl text-lg leading-8 text-muted">
							This page verifies that the updated CSS BEM methodology seamlessly functions alongside raw
							ad-hoc tailwind utility variations.
						</p>
						<div class="flex flex-wrap gap-3">
							<button class="button button--primary shadow-xl shadow-sky-500/20 hover:scale-105">
								Primary (inline hover/shadow)
							</button>
							<button class="button button--secondary border-fuchsia-500 text-fuchsia-600 hover:bg-fuchsia-50">
								Secondary (inline colors)
							</button>
						</div>
					</div>
					<div class="mt-8 card card--accent p-5 transform rotate-1 bg-linear-to-br from-background-accent to-sky-50 dark:to-sky-950">
						<p class="text-xs font-semibold uppercase tracking-[0.28em] text-muted">Inline styled card</p>
						<div class="mt-4 space-y-3 text-sm text-on-background-accent">
							<p>This BEM `.card--accent` also leverages:</p>
							<ul class="list-disc pl-5">
								<li>
									<code>transform rotate-1</code>
								</li>
								<li>
									<code>bg-gradient-to-br</code>
								</li>
								<li>
									<code>to-sky-50 dark:to-sky-950</code>
								</li>
							</ul>
						</div>
					</div>
				</section>
			</div>
		);
	},
});
