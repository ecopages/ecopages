import type { EcoComponent } from '@ecopages/core';
import type { ReactNode } from 'react';

export type BaseLayoutProps = {
	children: ReactNode;
};

export const BaseLayout: EcoComponent<BaseLayoutProps, ReactNode> = ({ children }) => {
	return <main data-testid="base-layout">{children}</main>;
};
