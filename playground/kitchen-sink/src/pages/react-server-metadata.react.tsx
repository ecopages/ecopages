/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { getReactServerMetadataSummary } from './react-server-metadata.server';
import { ReactPlaygroundLayout } from '@/layouts/react-playground-layout';
import type { ReactNode } from 'react';

export default eco.page<{}, ReactNode>({
	layout: ReactPlaygroundLayout,
	dependencies: {
		stylesheets: ['./docs.css'],
	},
	metadata: async () => {
		const { routeCount, scannedDir } = await getReactServerMetadataSummary();

		return {
			title: `React Server Metadata (${routeCount} routes)`,
			description: `Server-only metadata counted the React route files under ${scannedDir} before rendering this page.`,
		};
	},
	render: () => (
		<div className="space-y-8">
			<section className="docs-page__prose">
				<h1>Server-only metadata</h1>
				<p>
					This route computes its document title inside <code>metadata</code> by calling a server-only helper
					that scans the React pages directory.
				</p>
				<p>
					The browser page module should ship without the metadata helper or its filesystem dependency, while
					the final document title still reflects the server-side scan.
				</p>
			</section>

			<section className="card space-y-4">
				<p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">What this proves</p>
				<ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-muted">
					<li>Metadata can do server-only work without leaking its helper into the browser page module.</li>
					<li>The rendered document still gets the computed metadata output.</li>
					<li>The browser bundle should not keep the metadata helper or its filesystem dependency.</li>
				</ul>
				<div className="text-sm leading-7 text-muted">
					<a href="/react-server-files">Open the server tree route</a>
					{' · '}
					<a href="/react-lab">React Lab</a>
					{' · '}
					<a href="/docs">Kita MDX route</a>
				</div>
			</section>
		</div>
	),
});
