import { eco } from '@ecopages/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DocsLayout } from '@/layouts/docs-layout';
import type { ReactNode } from 'react';

const queryKey = ['persisted-layout-navigation-count'];

export default eco.page<{}, ReactNode>({
	layout: DocsLayout,
	render: () => {
		const queryClient = useQueryClient();
		const { data: count = 0 } = useQuery({
			queryKey,
			queryFn: () => 0,
			staleTime: Infinity,
		});

		return (
			<article data-testid="docs-page">
				<h1>Documentation</h1>
				<p>Welcome to the documentation. Select a topic from the sidebar.</p>
				<section id="install" style={{ marginTop: '1200px' }}>
					<h2>Installation</h2>
				</section>
				<p data-testid="query-client-count">{count}</p>
				<button
					type="button"
					data-testid="increment-query-client-count"
					onClick={() => queryClient.setQueryData<number>(queryKey, count + 1)}
				>
					Increment query client count
				</button>
				<p>
					<a href="/docs/getting-started" data-testid="link-getting-started">
						Go to Getting Started →
					</a>
				</p>
				<p>
					<a href="/">← Back to Home</a>
				</p>
			</article>
		);
	},
});
