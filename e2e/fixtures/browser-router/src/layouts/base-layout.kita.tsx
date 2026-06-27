import type { EcoComponent, EcoPagesElement } from '@ecopages/core';

export type BaseLayoutProps = {
	children: EcoPagesElement;
};

export const BaseLayout: EcoComponent<BaseLayoutProps> = ({ children }) => {
	return <main data-testid="base-layout">{children as 'safe'}</main>;
};

BaseLayout.config = {
	dependencies: {
		scripts: ['./base-layout.script.ts'],
	},
};
