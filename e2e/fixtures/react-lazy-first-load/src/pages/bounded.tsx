import { eco } from '@ecopages/core';
import { Component, lazy, Suspense, type ReactNode } from 'react';

const Heavy = lazy(() => import('../components/heavy.tsx'));

class EntryErrorBoundary extends Component<{ children?: ReactNode }, { error?: unknown }> {
	override state: { error?: unknown } = {};

	static getDerivedStateFromError(error: unknown) {
		return { error };
	}

	override render(): ReactNode {
		if (this.state.error) {
			return <p data-testid="entry-error">entry failed</p>;
		}
		return this.props.children;
	}
}

export default eco.page<Record<string, never>, ReactNode>({
	metadata: () => ({
		title: 'Lazy first load with a Page error boundary',
		description: 'Lazy first load bounded',
	}),
	render: () => (
		<main data-testid="page">
			<p data-testid="rest">rest of the page</p>
			<EntryErrorBoundary>
				<Suspense fallback={<p data-testid="loading">loading</p>}>
					<Heavy />
				</Suspense>
			</EntryErrorBoundary>
		</main>
	),
});
