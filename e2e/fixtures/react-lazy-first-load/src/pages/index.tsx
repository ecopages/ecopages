import { eco } from '@ecopages/core';
import { lazy, Suspense, type ReactNode } from 'react';

const Heavy = lazy(() => import('../components/heavy.tsx'));

export default eco.page<Record<string, never>, ReactNode>({
	metadata: () => ({ title: 'Lazy first load', description: 'Lazy first load' }),
	render: () => (
		<main data-testid="page">
			<p data-testid="rest">rest of the page</p>
			<Suspense fallback={<p data-testid="loading">loading</p>}>
				<Heavy />
			</Suspense>
		</main>
	),
});
