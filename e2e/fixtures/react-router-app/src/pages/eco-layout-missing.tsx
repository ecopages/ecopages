import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { MinimalEcoLayout } from '../layouts/minimal-eco-layout';

export default eco.page<{}, ReactNode>({
	layout: MinimalEcoLayout,
	render: () => (
		<div data-testid="eco-layout-missing-page">
			<h1>Eco Layout Missing</h1>
			<a href="/eco-layout-home" data-testid="link-eco-layout-home">
				Home
			</a>
		</div>
	),
});
