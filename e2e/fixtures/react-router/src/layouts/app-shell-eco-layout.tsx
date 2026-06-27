import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';

import './app-shell-eco-layout.css';

export const AppShellEcoLayout = eco.component<{ children: ReactNode }, ReactNode>({
	dependencies: {
		stylesheets: ['./app-shell-eco-layout.css'],
	},
	render: ({ children }) => (
		<div data-testid="app-shell-eco-layout" className="app-shell-eco-layout-root">
			<div className="layout__shell">{children}</div>
		</div>
	),
});
