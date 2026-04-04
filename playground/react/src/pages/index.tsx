import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Counter } from '@/components/counter';
import { RadiantCounter } from '@/components/radiant-counter';
import { Item, Select } from '@/components/select';
import { TanstackTable } from '@/components/tanstack-table';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page<{}, ReactNode>({
	dependencies: {
		stylesheets: ['./index.css'],
		components: [Counter, BaseLayout, TanstackTable, Select, RadiantCounter],
	},

	metadata: () => ({
		title: 'Home page',
		description: 'This is the homepage of the website',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	}),

	render: () => {
		return (
			<BaseLayout className="main-content">
				<h1 className="main-title">Ecopages</h1>
				<a href="/test" className="text-blue-700 underline block mb-2">
					Test Splitting
				</a>
				<a href="/images" className="text-blue-700 underline block mb-2">
					Test Images
				</a>
				<a href="/mdx-test" className="text-blue-700 underline block mb-6">
					Test MDX
				</a>
				<a href="/logo" className="text-blue-700 underline block mb-6">
					Test Logo
				</a>

				<h2 className="text-xl font-bold mt-4 mb-2">Reachability Examples (RFC 0001)</h2>
				<a href="/reachability-node-hydration" className="text-blue-700 underline block mb-2">
					1. Server Node APIs + Client Hydration
				</a>
				<a href="/reachability-mixed-pruning" className="text-blue-700 underline block mb-2">
					2. Safe Pruning of Unused Server Utilities
				</a>
				<a href="/reachability-analytics-pruning" className="text-blue-700 underline block mb-6">
					3. Safe Pruning of Top-Level Analytics
				</a>

				<Counter defaultValue={10} />
				<RadiantCounter count={5} />
				<Select label="Ice cream flavor">
					<Item>Chocolate</Item>
					<Item>Mint</Item>
					<Item>Strawberry</Item>
					<Item>Vanilla</Item>
				</Select>
				<TanstackTable />
			</BaseLayout>
		);
	},
});
