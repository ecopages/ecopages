/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { BaseLayout } from '@/layouts/base-layout';
import { ReactScriptApp } from '@/components/react-script-app/react-script-app.eco';

export default eco.page<{}, JsxRenderable>({
	layout: BaseLayout,
	metadata: () => ({
		title: 'React App From A Script',
		description: 'A React counter that a client script mounts with createRoot on an Ecopages JSX Page.',
	}),
	render: () => (
		<section class="card space-y-4" data-testid="page-react-script-app">
			<h1 class="font-display text-3xl font-semibold tracking-tight">React app from a script</h1>
			<p class="text-muted">
				No React Page or island: a <code>.script.tsx</code> file mounts the React counter in the browser.
			</p>
			<ReactScriptApp />
		</section>
	),
});
