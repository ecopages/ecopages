import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';

export type BaseLayoutProps = {
	children: EcoPagesElement;
};

export const BaseLayout = eco.layout<BaseLayoutProps>({
	dependencies: {
		scripts: ['./base-layout.script.ts'],
	},
	render: ({ children }) => <main data-testid="base-layout">{children as 'safe'}</main>,
});
