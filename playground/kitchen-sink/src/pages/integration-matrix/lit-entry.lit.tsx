import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { KitaCounter } from '@/components/kita-counter.kita';
import { KitaShell } from '@/components/kita-shell.kita';
import { LitCounter } from '@/components/lit-counter.lit';
import { LitShell } from '@/components/lit-shell.lit';
import { ReactCounter } from '@/components/react-counter.react';
import { ReactShell } from '@/components/react-shell.react';

export default eco.page({
	integration: 'lit',
	dependencies: {
		components: [BaseLayout, KitaShell, LitShell, ReactShell, KitaCounter, LitCounter, ReactCounter],
		stylesheets: ['./integration-matrix.css'],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'Lit Entry Matrix',
		description: 'Lit-first route that still renders Kita, React, counters, and React MDX content.',
	}),
	render: () => (
		<div class="space-y-8">
			<section class="card space-y-4">
				<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Lit route entry</p>
				<h1 class="font-display text-4xl font-semibold tracking-tight">
					The page entry can change while the matrix stays shared.
				</h1>
				<p class="max-w-3xl text-base leading-8 text-muted">
					This route starts in the Lit integration, then nests Kita and React content inside the same layout
					and navigation shell.
				</p>
			</section>

			<LitShell id="lit-entry-root">
				<KitaShell id="lit-entry-kita-child">
					<ReactShell id="lit-entry-react-child">lit-entry-child</ReactShell>
				</KitaShell>
			</LitShell>

			<section class="card space-y-4">
				<p class="text-xs uppercase tracking-[0.24em] text-muted">Counters</p>
				<div class="flex flex-wrap gap-3">
					<KitaCounter />
					<LitCounter />
					<ReactCounter />
				</div>
				<a class="text-xs underline text-muted" href="/react-content">
					View React MDX page
				</a>
			</section>
		</div>
	),
});
