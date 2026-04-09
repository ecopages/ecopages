/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { LitCounter } from '@/components/lit-counter.lit';
import { ReactCounter } from '@/components/react-counter.react';
import { ReactPlaygroundLayout } from '@/layouts/react-playground-layout';
import type { ReactNode } from 'react';

export default eco.page<{}, ReactNode>({
	layout: ReactPlaygroundLayout,
	dependencies: {
		components: [ReactCounter, LitCounter],
		stylesheets: ['./docs.css'],
	},
	metadata: () => ({
		title: 'React Content',
		description: 'React content route rendered through the React integration inside the kitchen sink.',
	}),
	render: () => (
		<div className="docs-page__prose" data-testid="page-react-content">
			<h1>React MDX</h1>
			<p>
				This route is rendered through <code>@ecopages/react</code>, while the document shell stays on the
				shared Kita HTML template and the page shell is owned by a React layout.
			</p>
			<ul>
				<li>The first navigation into this page can still come from the global browser router.</li>
				<li>
					Once hydrated, links between React-owned pages use <code>@ecopages/react-router</code>.
				</li>
				<li>
					Navigating back to a non-React route hands control back to the browser router for a smooth
					transition.
				</li>
				<li>
					The React page shell stays inside the React lane, so the router no longer has to push React elements
					through a Kita layout.
				</li>
			</ul>

			<h2>Interactive content</h2>
			<div className="flex flex-wrap gap-3 my-6 not-prose">
				<ReactCounter />
				<lit-counter count={1}></lit-counter>
			</div>

			<h2>Route handoff</h2>
			<ul>
				<li>
					<a href="/react-lab" data-testid="route-link-react-lab">
						Open the companion React page
					</a>
				</li>
				<li>
					<a href="/react-notes" data-testid="route-link-react-notes">
						Open the second React page
					</a>
				</li>
				<li>
					<a href="/docs" data-testid="route-link-docs">
						Back to the Kita MDX page
					</a>
				</li>
				<li>
					<a href="/integration-matrix" data-testid="route-link-integration-matrix">
						Back to the integration matrix
					</a>
				</li>
			</ul>
		</div>
	),
});
