import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { AppShellEcoLayout } from '../layouts/app-shell-eco-layout';

export default eco.page<{}, ReactNode>({
	layout: AppShellEcoLayout,
	render: () => (
		<div data-testid="eco-layout-home-page">
			<h1>Eco Layout Home</h1>
		</div>
	),
});
