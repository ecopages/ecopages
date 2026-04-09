/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { KitaCounter } from '@/components/kita-counter.kita';
import { LitCounter } from '@/components/lit-counter.lit';
import { ReactCounter } from '@/components/react-counter.react';
import { ReactShell } from '@/components/react-shell.react';
import { ReactPlaygroundLayout } from '@/layouts/react-playground-layout';
import type { ReactNode } from 'react';

export default eco.page<{}, ReactNode>({
	integration: 'react',
	layout: ReactPlaygroundLayout,
	dependencies: {
		components: [ReactPlaygroundLayout, ReactShell, KitaCounter, LitCounter, ReactCounter],
		stylesheets: ['./integration-matrix.css'],
	},
	metadata: () => ({
		title: 'React Entry Matrix',
		description: 'React-first shell inside the kitchen-sink matrix route.',
	}),
	render: () => (
		<div className="space-y-8">
			<section className="card space-y-4">
				<p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">React shell entry</p>
				<h1 className="font-display text-4xl font-semibold tracking-tight">
					The React boundary can anchor the route without owning the whole page.
				</h1>
				<p className="max-w-3xl text-base leading-8 text-muted">
					This follows the e2e kitchen-sink pattern more closely: the file-system page remains Kita-based
					while the primary interactive shell is React and still nests Lit and Kita content inside it.
				</p>
			</section>

			<ReactShell id="react-entry-root">react-entry-child</ReactShell>

			<section className="integration-shell integration-shell--kita" data-kita-shell="react-entry-kita-child">
				<p className="integration-shell__label">Kita shell · react-entry-kita-child</p>
				<div className="integration-shell__body">
					<section
						className="integration-shell integration-shell--lit"
						data-lit-shell="react-entry-lit-child"
					>
						<p className="integration-shell__label">Lit shell · react-entry-lit-child</p>
						<div className="integration-shell__body">
							<span data-cross-child="react-entry">react-entry-nested-child</span>
						</div>
					</section>
				</div>
			</section>

			<section className="card space-y-4">
				<p className="text-xs uppercase tracking-[0.24em] text-muted">Counters</p>
				<div className="flex flex-wrap gap-3">
					<div className="integration-counter" data-kita-counter>
						<button className="integration-counter__button" type="button" data-kita-inc>
							+
						</button>
						<span className="integration-counter__value" data-kita-value>
							0
						</span>
					</div>
					<LitCounter count={0} />
					<ReactCounter />
				</div>
				<a className="text-xs underline text-muted" href="/react-content">
					View React MDX page
				</a>
			</section>
		</div>
	),
});
