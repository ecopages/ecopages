import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { KitaCounter } from '@/components/kita-counter.kita';
import { KitaShell } from '@/components/kita-shell.kita';
import { LitCounter } from '@/components/lit-counter.lit';
import { LitShell } from '@/components/lit-shell.lit';
import { ReactCounter } from '@/components/react-counter.react';
import { ReactShell } from '@/components/react-shell.react';

export default eco.page({
	dependencies: {
		components: [BaseLayout, KitaShell, LitShell, ReactShell, KitaCounter, LitCounter, ReactCounter],
		stylesheets: ['./integration-matrix.css'],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'React Entry Matrix',
		description: 'React-first shell inside the kitchen-sink matrix route.',
	}),
	render: () => (
		<div class="space-y-8">
			<section class="card space-y-4">
				<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">React shell entry</p>
				<h1 class="font-display text-4xl font-semibold tracking-tight">
					The React boundary can anchor the route without owning the whole page.
				</h1>
				<p class="max-w-3xl text-base leading-8 text-muted">
					This follows the e2e kitchen-sink pattern more closely: the file-system page remains Kita-based
					while the primary interactive shell is React and still nests Lit and Kita content inside it.
				</p>
			</section>

			<ReactShell id="react-entry-root">react-entry-child</ReactShell>

			<KitaShell id="react-entry-kita-child">
				<LitShell id="react-entry-lit-child">
					<span data-cross-child="react-entry">react-entry-nested-child</span>
				</LitShell>
			</KitaShell>

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
