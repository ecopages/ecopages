import { eco } from '@ecopages/core';
import { DocsLayout } from '@/layouts/docs-layout.kita';

export default eco.page({
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
