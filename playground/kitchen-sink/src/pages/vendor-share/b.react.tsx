/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { parseVendorSharePayload } from '@/data/vendor-share';
import { ReactPlaygroundLayout } from '@/layouts/react-playground-layout.react';
import type { ReactNode } from 'react';

const payload = parseVendorSharePayload({ label: 'vendor-share-b', value: 2 });

export default eco.page<{}, ReactNode>({
	layout: ReactPlaygroundLayout,
	dependencies: {
		stylesheets: ['../docs.css'],
	},
	metadata: () => ({
		title: 'Vendor Share B',
		description: 'Second kitchen-sink fixture page for shared browser vendor URLs.',
	}),
	render: () => (
		<div className="space-y-4" data-testid="page-vendor-share-b">
			<h1>Vendor Share B</h1>
			<p data-testid="vendor-share-label">{payload.label}</p>
			<p data-testid="vendor-share-value">{payload.value}</p>
			<a href="/vendor-share/a" data-testid="vendor-share-link-a">
				Open vendor share A
			</a>
		</div>
	),
});
