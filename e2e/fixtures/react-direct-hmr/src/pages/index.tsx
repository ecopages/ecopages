import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { LitCounter } from '@/components/lit-counter.lit';

export default eco.page<{ count: number }, ReactNode>({
	dependencies: {
		components: [LitCounter],
	},
	metadata: () => ({ title: 'Direct HMR', description: 'Direct HMR of a foreign Lit Component' }),
	props: async () => ({ count: 1 }),
	render: ({ count }) => (
		<main data-testid="page">
			<h1>Direct HMR</h1>
			<div data-testid="inline">
				<LitCounter count={1} />
			</div>
			<div data-testid="static">
				<LitCounter count={count} />
			</div>
			<p data-testid="static-count">{count}</p>
		</main>
	),
});
