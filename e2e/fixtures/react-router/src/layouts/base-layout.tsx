import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { markSharedLayoutClientProbe } from './shared-layout-client-probe';

export type BaseLayoutProps = {
	children: ReactNode;
};

export const BaseLayout = eco.layout<BaseLayoutProps, ReactNode>({
	render: ({ children }) => {
		markSharedLayoutClientProbe();
		return <main data-testid="base-layout">{children}</main>;
	},
});
