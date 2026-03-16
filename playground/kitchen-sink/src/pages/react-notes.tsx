/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { ReactCounter } from '@/components/react-counter.react';
import { ReactShell } from '@/components/react-shell.react';
import { getRouteLinkTestId } from '@/data/primary-links';
import { ReactPlaygroundLayout } from '@/layouts/react-playground-layout';
import type { ReactNode } from 'react';

export default eco.page<{}, ReactNode>({
	layout: ReactPlaygroundLayout,
	dependencies: {
		components: [ReactCounter, ReactShell],
		stylesheets: ['./docs.css'],
	},
	metadata: () => ({
		title: 'React Notes',
		description: 'Second React page for testing React-to-React navigation behavior.',
	}),
	render: () => (
		<div className="space-y-8" data-testid="page-react-notes">
			<section className="docs-page__prose">
				<h1>React Notes</h1>
				<p>
					This is a second non-MDX React route in the same layout group. Navigate here from{' '}
					<a href="/react-lab" data-testid={getRouteLinkTestId('/react-lab')}>
						React Lab
					</a>{' '}
					or the React MDX route to confirm client-side routing stays in the React lane.
				</p>
			</section>

			<div className="not-prose grid gap-6 lg:grid-cols-2">
				<ReactShell id="react-notes-links">
					<div className="space-y-4 text-sm leading-7 text-muted">
						<p>Expected behavior:</p>
						<ul className="list-disc space-y-2 pl-5">
							<li>React layout stays mounted.</li>
							<li>Only the page content swaps.</li>
							<li>Returning to a Kita route hands off back to the browser router.</li>
						</ul>
					</div>
				</ReactShell>

				<section className="card space-y-4">
					<p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">Interactive state</p>
					<p className="text-sm leading-7 text-muted">
						Use this counter after navigating in from another React route to confirm the page hydrated
						cleanly.
					</p>
					<ReactCounter />
					<div className="text-sm leading-7 text-muted">
						<a href="/react-lab" data-testid={getRouteLinkTestId('/react-lab')}>
							Back to React Lab
						</a>
						{' · '}
						<a href="/react-server-files" data-testid={getRouteLinkTestId('/react-server-files')}>
							Open the server-only filesystem tree route
						</a>
						{' · '}
						<a href="/react-server-metadata" data-testid={getRouteLinkTestId('/react-server-metadata')}>
							Open the server-only metadata route
						</a>
						{' · '}
						<a href="/react-content" data-testid={getRouteLinkTestId('/react-content')}>
							Open the React MDX route
						</a>
						{' · '}
						<a href="/docs" data-testid={getRouteLinkTestId('/docs')}>
							Exit to the Kita MDX route
						</a>
					</div>
				</section>
			</div>
		</div>
	),
});
