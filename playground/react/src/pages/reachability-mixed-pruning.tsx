import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { BaseLayout } from '@/layouts/base-layout';
// oxlint-disable-next-line no-unused-vars
import { formatDate, dbSecretQuery } from '@/utils/mixed-utils';

export default eco.page<{}, ReactNode>({
	metadata: () => ({
		title: 'Mixed Utils Pruning',
		description: 'Testing reachability of mixed utils',
	}),
	dependencies: {
		stylesheets: ['./index.css'],
		components: [],
	},
	render: () => {
		/**
		 * Only formatDate is reachable.
		 * dbSecretQuery and its 'node:fs' dependency are completely dropped from the client bundle.
		 */
		return (
			<BaseLayout className="main-content">
				<h1 className="main-title">Mixed Utils Pruning</h1>
				<p>
					Today is: <strong>{formatDate(new Date())}</strong>
				</p>
				<p>
					Check the built output; <code>dbSecretQuery</code> and <code>node:fs</code> are gone!
				</p>
			</BaseLayout>
		);
	},
});
