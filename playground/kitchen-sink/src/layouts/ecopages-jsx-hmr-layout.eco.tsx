/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

export const EcopagesJsxHmrLayout = eco.layout<JsxRenderable>({
	dependencies: {
		scripts: ['./ecopages-jsx-hmr-layout.script.ts'],
	},
	render: ({ children }: LayoutProps) => (
		<div>
			<p data-testid="ecopages-jsx-hmr-layout-marker">Ecopages JSX Layout baseline</p>
			<nav data-eco-persist="ecopages-jsx-hmr-layout">
				<label>
					Layout state
					<input type="text" data-testid="ecopages-jsx-hmr-layout-state" />
				</label>
			</nav>
			<main>{children}</main>
		</div>
	),
});
