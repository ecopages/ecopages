import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { BaseLayout } from '@/layouts/base-layout';

/**
 * This is a side-effect import that is NOT reachable from render.
 * It should be completely pruned. Run on server, removed on client.
 */
import '@/utils/init-analytics';

export default eco.page<{}, ReactNode>({
	metadata: () => ({
		title: 'Analytics Pruning',
		description: 'Testing reachability of top-level side effects',
	}),
	dependencies: {
		stylesheets: ['./index.css'],
		components: [],
	},
	render: () => {
		return (
			<BaseLayout className="main-content">
				<h1 className="main-title">Analytics Pruning</h1>
				<p>
					The <code>init-analytics.ts</code> script was imported at the top of this file, but because it is
					not reachable from `render`, it was pruned.
				</p>
				<p>Check the browser console: you should NOT see the analytics initialized message.</p>
			</BaseLayout>
		);
	},
});
