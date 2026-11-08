/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { kitClass } from '@ecopages/e2e-package-css-lib/kit';

export const KitLibBadge = eco.component<{}, JsxRenderable>({
	render: () => (
		<span data-testid="kit-lib-eco" class={kitClass}>
			Kit lib Eco
		</span>
	),
});
