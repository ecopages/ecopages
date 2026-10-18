import { eco } from '@ecopages/core';
import { useQuery } from '@tanstack/react-query';
import { DocsLayout } from '@/layouts/docs-layout';
import type { ReactNode } from 'react';

const queryKey = ['persisted-layout-navigation-count'];

export default eco.page<{}, ReactNode>({
	layout: DocsLayout,
	render: () => {
		const { data: count = 0 } = useQuery({
			queryKey,
			queryFn: () => 0,
			staleTime: Infinity,
		});

		return (
			<article data-testid="docs-getting-started">
				<h1>Getting Started</h1>
				<p>Learn how to get started with Ecopages.</p>
				<p data-testid="query-client-count">{count}</p>
				<p>
					<a href="/docs" data-testid="link-docs-home">
						← Back to Documentation
					</a>
				</p>
			</article>
		);
	},
});
