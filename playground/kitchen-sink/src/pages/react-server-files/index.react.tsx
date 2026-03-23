/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { buildPagesTreeSnapshot } from './tree.server';
import { ReactPlaygroundLayout } from '@/layouts/react-playground-layout';
import type { ReactNode } from 'react';

type ReactServerFilesPageProps = {
	scannedDir: string;
	fileCount: number;
	routeFiles: string[];
	tree: string;
};

export default eco.page<ReactServerFilesPageProps, ReactNode>({
	layout: ReactPlaygroundLayout,
	dependencies: {
		stylesheets: ['../docs.css'],
	},
	staticProps: async () => {
		return {
			props: await buildPagesTreeSnapshot(),
		};
	},
	metadata: () => ({
		title: 'React Server Files',
		description:
			'React route proving that .server.ts helpers and @ecopages/file-system stay on the server while the browser receives serialized props.',
	}),
	render: ({ fileCount, routeFiles, scannedDir, tree }) => (
		<div className="space-y-8">
			<section className="docs-page__prose">
				<h1>Server-only file tree</h1>
				<p>
					This route gets its data from <code>tree.server.ts</code>, which imports{' '}
					<code>@ecopages/file-system</code> and scans <code>{scannedDir}</code> before render.
				</p>
				<p>
					The browser should only receive the serialized tree and route props. The server helper itself should
					never appear in the shipped page module.
				</p>
			</section>

			<div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
				<section className="card space-y-5">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">Server checks</p>
						<h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">Filesystem snapshot</h2>
					</div>
					<dl className="space-y-4 text-sm leading-7 text-muted">
						<div>
							<dt className="text-xs uppercase tracking-[0.24em] text-muted">Scanned directory</dt>
							<dd className="font-mono text-on-background">{scannedDir}</dd>
						</div>
						<div>
							<dt className="text-xs uppercase tracking-[0.24em] text-muted">File count</dt>
							<dd className="font-mono text-on-background">{fileCount}</dd>
						</div>
					</dl>

					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Route files</p>
						<ul className="mt-3 space-y-2 text-sm leading-7 text-muted">
							{routeFiles.map((file) => (
								<li key={file} className="font-mono text-xs text-on-background">
									{file}
								</li>
							))}
						</ul>
					</div>

					<div className="text-sm leading-7 text-muted">
						<a href="/react-lab">React Lab</a>
						{' · '}
						<a href="/react-server-metadata">Server-only metadata</a>
						{' · '}
						<a href="/react-notes">React Notes</a>
						{' · '}
						<a href="/docs">Kita MDX route</a>
					</div>
				</section>

				<section className="card space-y-4">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">Generated tree</p>
						<h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">
							Server-derived page inventory
						</h2>
					</div>
					<pre className="overflow-x-auto rounded-lg bg-background-accent p-4 text-xs leading-6 text-on-background-accent">
						<code>{tree}</code>
					</pre>
				</section>
			</div>
		</div>
	),
});
