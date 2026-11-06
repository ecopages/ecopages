import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { LayoutCounter } from './layout-counter';
import { markSharedLayoutClientProbe } from './shared-layout-client-probe';

export type BaseLayoutProps = {
	children: ReactNode;
};

/**
 * @remarks
 * Kept in `eco.layout()`, unlike `DocsLayout`, so the suite covers wrapped layouts next to plain ones.
 */
export const BaseLayout = eco.layout<ReactNode>({
	render: ({ children }) => {
		markSharedLayoutClientProbe();
		return (
			<main data-testid="base-layout">
				<LayoutCounter testId="base-layout-counter" />
				{children}
			</main>
		);
	},
});
