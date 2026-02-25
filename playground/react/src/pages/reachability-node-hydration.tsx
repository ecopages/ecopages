import { eco } from '@ecopages/core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';
import { BaseLayout } from '@/layouts/base-layout';

// Hydrated client component (an inline example, but normally imported)
import { InteractiveList } from '@/components/interactive-list';

/**
 * This function NEVER ships to the client
 * It is only executed on the server
 */
function loadServerData(): string[] {
	try {
		const filePath = path.join(process.cwd(), 'package.json');
		const pkg = JSON.parse(readFileSync(filePath, 'utf-8'));
		return Object.keys(pkg.dependencies || {});
	} catch {
		return ['Error loading dependencies'];
	}
}

export default eco.page<{ data: string[] }, ReactNode>({
	metadata: () => ({
		title: 'Node APIs + Client Hydration',
		description: 'Testing reachability of Node APIs',
	}),
	dependencies: {
		stylesheets: ['./index.css'],
		components: [InteractiveList],
	},
	staticProps: async () => {
		return { props: { data: loadServerData() } };
	},
	render: (props: { data: string[] }) => {
		return (
			<BaseLayout className="main-content">
				<h1 className="main-title">Node APIs + Hydration</h1>
				<p>
					The below list is loaded using <code>node:fs</code> on the server, but hydrated on the client.
				</p>
				<InteractiveList initialData={props.data} />
			</BaseLayout>
		);
	},
});
