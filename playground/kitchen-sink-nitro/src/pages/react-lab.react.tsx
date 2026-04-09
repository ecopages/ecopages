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
		title: 'React Lab',
		description: 'React page route inside the kitchen sink using a React-owned layout.',
	}),
	render: () => (
		<div className="space-y-8" data-testid="page-react-lab">
			<section className="docs-page__prose">
				<h1>React Page Route</h1>
				<p>
					This page is a normal React route wired through a React-owned layout so the client router can keep
					the page shell stable while React pages swap underneath it.
				</p>
				<p>
					Use the links below to move between the React MDX route, another React page, and the non-React docs
					route to confirm the handoff points.
				</p>
			</section>

			<div className="not-prose grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
				<ReactShell id="react-lab-counter">
					<div className="space-y-4">
						<p className="text-sm leading-7 text-muted">
							This counter stays inside the React render lane and lets you verify hydration after
							navigating in from another React page.
						</p>
						<ReactCounter />
					</div>
				</ReactShell>

				<section className="card space-y-4">
					<p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">Route checks</p>
					<ul className="space-y-3 text-sm leading-7 text-muted">
						<li>
							<a href="/react-content" data-testid={getRouteLinkTestId('/react-content')}>
								Open the React MDX companion route
							</a>
						</li>
						<li>
							<a href="/react-notes" data-testid={getRouteLinkTestId('/react-notes')}>
								Open a second React page in the same layout set
							</a>
						</li>
						<li>
							<a href="/react-server-files" data-testid={getRouteLinkTestId('/react-server-files')}>
								Open the server-only filesystem tree route
							</a>
						</li>
						<li>
							<a href="/react-server-metadata" data-testid={getRouteLinkTestId('/react-server-metadata')}>
								Open the server-only metadata route
							</a>
						</li>
						<li>
							<a href="/docs" data-testid={getRouteLinkTestId('/docs')}>
								Return to the standalone Kita MDX page
							</a>
						</li>
						<li>
							<a href="/integration-matrix" data-testid={getRouteLinkTestId('/integration-matrix')}>
								Return to the integration matrix
							</a>
						</li>
					</ul>
				</section>
			</div>
		</div>
	),
});
