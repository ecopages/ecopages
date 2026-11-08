import { eco } from '@ecopages/core';

export const BaseLayout = eco.layout({
	dependencies: {
		scripts: ['./base-layout.script.ts'],
	},
	render: ({ children }) => <main data-testid="base-layout">{children as 'safe'}</main>,
});
