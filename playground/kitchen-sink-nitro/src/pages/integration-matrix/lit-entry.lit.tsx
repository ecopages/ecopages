import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { KitaCounter } from '@/components/kita-counter.kita';
import { KitaShell } from '@/components/kita-shell.kita';
import { LitCounter } from '@/components/lit-counter.lit';
import { LitShell } from '@/components/lit-shell.lit';

export default eco.page({
	integration: 'lit',
	dependencies: {
		components: [BaseLayout, KitaShell, LitShell, KitaCounter, LitCounter],
		stylesheets: ['./integration-matrix.css'],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'Lit Entry Matrix',
		description: 'Lit-first route that renders Lit and Kita shells while linking out to the React-owned routes.',
	}),
	render: () => (
		<div class="space-y-8">
			<section class="card space-y-4">
				<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Lit route entry</p>
				<h1 class="font-display text-4xl font-semibold tracking-tight">
					The page entry can change while the matrix stays shared.
				</h1>
				<p class="max-w-3xl text-base leading-8 text-muted">
					This route starts in the Lit integration, then nests a Kita shell inside the same layout while
					linking across to the React-owned pages for the rest of the matrix.
				</p>
			</section>

			<LitShell id="lit-entry-root">
				<KitaShell id="lit-entry-kita-child">lit-entry-child</KitaShell>
			</LitShell>

			<section class="card space-y-4">
				<p class="text-xs uppercase tracking-[0.24em] text-muted">Counters</p>
				<div class="flex flex-wrap gap-3">
					<KitaCounter />
					<LitCounter />
				</div>
				<div class="text-xs underline text-muted space-x-2">
					<a href="/react-content">View React MDX page</a>
					<span>·</span>
					<a href="/react-lab">Open React Lab</a>
				</div>
			</section>
		</div>
	),
});
