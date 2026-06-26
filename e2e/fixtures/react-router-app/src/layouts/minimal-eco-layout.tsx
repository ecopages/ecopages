import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';

import './minimal-eco-layout.css';

export const MinimalEcoLayout = eco.component<{ children: ReactNode }, ReactNode>({
	dependencies: {
		stylesheets: ['./minimal-eco-layout.css'],
	},
	render: ({ children }) => (
		<div data-testid="minimal-eco-layout" className="minimal-eco-layout-root">
			{children}
		</div>
	),
});
