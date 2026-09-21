import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
export const DocsPagination = eco.component<Record<string, never>, JsxRenderable>({
	dependencies: {
		scripts: [{ src: './docs-pagination.script.tsx', ssr: true }],
	},
	render: () => {
		return <radiant-docs-pagination class="docs-layout__pagination" />;
	},
});
