import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { showcasePatterns, type ShowcasePattern } from '@/data/demo-data';

type CatalogPageProps = {
	pattern: ShowcasePattern | null;
};

export default eco.page<CatalogPageProps>({
	dependencies: {
		components: [BaseLayout],
	},
	layout: BaseLayout,
	staticPaths: async () => {
		return {
			paths: showcasePatterns.map((pattern) => ({ params: { slug: pattern.slug } })),
		};
	},
	staticProps: async ({ pathname }) => {
		const slug = pathname.params.slug as string;
		const pattern = showcasePatterns.find((entry) => entry.slug === slug) ?? null;
		return {
			props: {
				pattern,
			},
		};
	},
	metadata: ({ props }) => {
		if (!props.pattern) {
			return {
				title: 'Catalog entry missing',
				description: 'The requested catalog entry could not be resolved.',
			};
		}

		return {
			title: `${props.pattern.title} | Kitchen Sink`,
			description: props.pattern.summary,
		};
	},
	render: ({ params, pattern }) => {
		if (!pattern) {
			return (
				<section class="rounded-[1.75rem] border border-border bg-background p-8">
					<h1 class="font-display text-4xl font-semibold tracking-tight">Unknown catalog entry</h1>
					<p class="mt-4 text-muted">
						No static props were found for the slug <span class="font-mono">{params?.slug as string}</span>.
					</p>
				</section>
			);
		}

		return (
			<div class="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
				<section class="rounded-[1.75rem] border border-border bg-background p-8">
					<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">
						Static paths + static props
					</p>
					<h1 class="mt-3 font-display text-4xl font-semibold tracking-tight">{pattern.title}</h1>
					<p class="mt-4 text-base leading-8 text-muted">{pattern.summary}</p>
					<div class="mt-6 flex flex-wrap gap-2">
						{pattern.highlights.map((highlight) => (
							<span class="rounded-full border border-border bg-background-accent px-3 py-1 text-xs font-semibold text-on-background-accent">
								{highlight}
							</span>
						))}
					</div>
				</section>
				<aside class="rounded-[1.75rem] border border-border bg-background-accent p-8 text-sm text-on-background-accent">
					<p class="text-xs font-semibold uppercase tracking-[0.28em] text-muted">Entry metadata</p>
					<dl class="mt-5 space-y-4">
						<div>
							<dt class="text-xs uppercase tracking-[0.24em] text-muted">Slug</dt>
							<dd class="mt-1 font-mono text-base">{pattern.slug}</dd>
						</div>
						<div>
							<dt class="text-xs uppercase tracking-[0.24em] text-muted">Stage</dt>
							<dd class="mt-1 text-base font-semibold capitalize">{pattern.stage}</dd>
						</div>
						<div>
							<dt class="text-xs uppercase tracking-[0.24em] text-muted">Release lane</dt>
							<dd class="mt-1 text-base font-semibold">{pattern.release}</dd>
						</div>
					</dl>
				</aside>
			</div>
		);
	},
});
