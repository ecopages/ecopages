/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { parseVendorSharePayload } from '@/data/vendor-share';
import { ReactPlaygroundLayout } from '@/layouts/react-playground-layout.react';
import type { ReactNode } from 'react';

const payload = parseVendorSharePayload({ label: 'vendor-share-a', value: 1 });

export default eco.page<{}, ReactNode>({
	layout: ReactPlaygroundLayout,
	dependencies: {
		stylesheets: ['../docs.css'],
	},
	metadata: () => ({
		title: 'Vendor Share A',
		description: 'Kitchen-sink fixture for shared browser vendor URLs.',
	}),
	render: () => (
		<div className="space-y-4" data-testid="page-vendor-share-a">
			<h1>Vendor Share A</h1>
			<p data-testid="vendor-share-label">{payload.label}</p>
			<p data-testid="vendor-share-value">{payload.value}</p>
			<a href="/vendor-share/b" data-testid="vendor-share-link-b">
				Open vendor share B
			</a>
		</div>
	),
});
