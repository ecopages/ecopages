import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { KitaCounter } from '@/components/kita-counter.kita';
import { KitaShell } from '@/components/kita-shell.kita';
import { LitCounter } from '@/components/lit-counter.lit';
import { LitShell } from '@/components/lit-shell.lit';
import { ReactCounterStatic } from '@/components/react-counter-static.kita';
import { ReactShellStatic } from '@/components/react-shell-static.kita';

export default eco.page({
	dependencies: {
		components: [BaseLayout, KitaShell, LitShell, ReactShellStatic, KitaCounter, LitCounter, ReactCounterStatic],
		stylesheets: ['./integration-matrix.css'],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'Integration Matrix',
		description: 'Nested Kita, Lit, React, and MDX rendering inside the kitchen sink.',
	}),
	render: () => (
		<div class="space-y-8" data-testid="page-integration-matrix">
			<section class="card space-y-4">
				<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Cross integration matrix</p>
				<h1 class="font-display text-4xl font-semibold tracking-tight">
					Render every integration through every other one.
				</h1>
				<p class="max-w-3xl text-base leading-8 text-muted">
					This route mirrors the e2e kitchen sink intent: one page exercises nested Kita, Lit, React, and
					React-flavored MDX blocks while the browser router transitions between different entry routes.
				</p>
				<div class="flex flex-wrap gap-3 text-sm">
					<a class="button button--primary" href="/integration-matrix/lit-entry">
						Open Lit entry
					</a>
					<a class="button button--secondary" href="/integration-matrix/react-entry">
						Open React entry
					</a>
				</div>
			</section>

			<section class="grid gap-6 lg:grid-cols-3">
				<KitaShell id="kita-root">
					<LitShell id="kita-lit-child">
						<ReactShellStatic id="kita-react-child">kita-root-child</ReactShellStatic>
					</LitShell>
				</KitaShell>

				<LitShell id="lit-root">
					<KitaShell id="lit-kita-child">
						<span data-cross-child="lit-root">lit-root-child</span>
					</KitaShell>
				</LitShell>

				<ReactShellStatic id="react-root">react-root-child</ReactShellStatic>
			</section>

			<section class="card space-y-4">
				<p class="text-xs uppercase tracking-[0.24em] text-muted">Deep deferred React graph</p>
				<p class="max-w-3xl text-sm leading-7 text-muted">
					This chain keeps the page entry in Kita while forcing three nested React-owned boundaries through
					the marker graph before the final HTML is assembled.
				</p>
				<ReactShellStatic id="react-deep-root">
					<ReactShellStatic id="react-deep-middle">
						<ReactShellStatic id="react-deep-leaf">react-deep-child</ReactShellStatic>
					</ReactShellStatic>
				</ReactShellStatic>
			</section>

			<section class="card space-y-4">
				<p class="text-xs uppercase tracking-[0.24em] text-muted">Counters across integrations</p>
				<div class="flex flex-wrap gap-3">
					<KitaCounter />
					<LitCounter />
					<ReactCounterStatic />
				</div>
				<a class="text-xs underline text-muted" href="/react-content">
					View React MDX page
				</a>
			</section>
		</div>
	),
});
