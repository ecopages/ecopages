import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import type { ReleaseNote } from '@/data/demo-data';

type LatestReleaseViewProps = {
	release: ReleaseNote;
};

export default eco.page<LatestReleaseViewProps>({
	dependencies: {
		components: [BaseLayout],
	},
	integration: 'kitajs',
	layout: BaseLayout,
	metadata: ({ props }) => ({
		title: `${props.release.title} | Latest release`,
		description: props.release.body,
	}),
	render: ({ release }) => {
		return (
			<section class="grid gap-6 rounded-[1.75rem] border border-border bg-background p-8 lg:grid-cols-[1.1fr_0.9fr]">
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">ctx.render()</p>
					<h1 class="mt-3 font-display text-4xl font-semibold tracking-tight">{release.title}</h1>
					<p class="mt-4 text-base leading-8 text-muted">{release.body}</p>
				</div>
				<aside class="rounded-2xl border border-border bg-background-accent p-6 text-on-background-accent">
					<p class="text-xs uppercase tracking-[0.24em] text-muted">Release {release.version}</p>
					<ul class="mt-4 space-y-3 text-sm leading-7">
						{release.highlights.map((highlight) => (
							<li>{highlight}</li>
						))}
					</ul>
				</aside>
			</section>
		);
	},
});