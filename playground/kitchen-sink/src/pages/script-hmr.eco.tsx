/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { BaseLayout } from '@/layouts/base-layout';
import { ScriptHmrHost } from '@/components/script-hmr/script-hmr-host.eco';

export default eco.page<{}, JsxRenderable>({
	integration: 'ecopages-jsx',
	dependencies: {
		components: [BaseLayout, ScriptHmrHost],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'Script HMR Fixture',
		description: 'Validates declared client script entrypoints rebuild during development.',
	}),
	render: () => (
		<section class="card space-y-4" data-testid="page-script-hmr">
			<h1 class="font-display text-3xl font-semibold tracking-tight">Script HMR fixture</h1>
			<ScriptHmrHost />
		</section>
	),
});
