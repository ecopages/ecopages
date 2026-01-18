import { eco } from '@ecopages/core';
import { DocsLayout } from '@/layouts/docs-layout';
import type { ReactNode } from 'react';

export default eco.page<{}, ReactNode>({
	layout: DocsLayout,
	render: () => (
		<article data-testid="docs-page">
			<h1>Documentation</h1>
			<p>Welcome to the documentation. Select a topic from the sidebar.</p>
			<p>
				<a href="/docs/getting-started" data-testid="link-getting-started">
					Go to Getting Started →
				</a>
			</p>
			<p>
				<a href="/">← Back to Home</a>
			</p>
		</article>
	),
});
