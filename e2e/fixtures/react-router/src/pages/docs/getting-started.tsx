import { eco } from '@ecopages/core';
import { DocsLayout } from '@/layouts/docs-layout';
import type { ReactNode } from 'react';

export default eco.page<{}, ReactNode>({
	layout: DocsLayout,
	render: () => (
		<article data-testid="docs-getting-started">
			<h1>Getting Started</h1>
			<p>Learn how to get started with Ecopages.</p>
			<p>
				<a href="/docs" data-testid="link-docs-home">
					← Back to Documentation
				</a>
			</p>
		</article>
	),
});
