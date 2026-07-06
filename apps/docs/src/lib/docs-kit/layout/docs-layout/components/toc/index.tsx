import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import './toc.script';

export const DocsToc = eco.component<Record<string, never>, JsxRenderable>({
	dependencies: {
		scripts: ['./toc.script.tsx'],
	},
	render: () => {
		return <radiant-toc class="docs-layout__toc" />;
	},
});
