import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { studioCrew } from '@/data/demo-data';

export default eco.page({
	dependencies: {
		components: [BaseLayout],
	},
	integration: 'kitajs',
	layout: BaseLayout,
	metadata: () => ({
		title: 'Explicit team route',
		description: 'A page registered through app.static() while still using the normal EcoPages layout and HTML shell.',
	}),
	render: () => {
		return (
			<section class="space-y-6 rounded-[1.75rem] border border-border bg-background p-8">
				<div class="space-y-3">
					<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">app.static()</p>
					<h1 class="font-display text-4xl font-semibold tracking-tight">Explicit routes can still feel native.</h1>
					<p class="max-w-3xl text-base leading-8 text-muted">
						This page is not discovered from the filesystem router. It is registered directly in <span class="font-mono">app.ts</span>, yet it renders through the same layout, metadata, and dependency system as normal pages.
					</p>
				</div>
				<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					{studioCrew.map((member) => (
						<article class="rounded-2xl border border-border bg-background-accent p-5">
							<p class="text-xs uppercase tracking-[0.24em] text-muted">{member.focus}</p>
							<h2 class="mt-2 font-display text-2xl font-semibold tracking-tight text-on-background-accent">{member.name}</h2>
							<p class="mt-2 text-sm leading-7 text-muted">{member.track}</p>
						</article>
					))}
				</div>
			</section>
		);
	},
});