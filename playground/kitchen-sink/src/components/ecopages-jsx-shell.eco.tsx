/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { EcoChildren } from '@ecopages/core';
import { createMarkupNodeLike, type JsxRenderable } from '@ecopages/jsx';
import { renderToString } from '@ecopages/jsx/server';

type EcopagesJsxShellProps = {
	id: string;
	children?: JsxRenderable | EcoChildren;
};

export const EcopagesJsxShell = eco.component<EcopagesJsxShellProps, JsxRenderable>({
	integration: 'ecopages-jsx',
	render: ({ id, children }) => {
		const renderedChildren =
			children === undefined
				? undefined
				: createMarkupNodeLike(
						typeof children === 'string' ? children : renderToString(children as JsxRenderable),
					);

		return (
			<section class="integration-shell integration-shell--ecopages-jsx" data-ecopages--jsx-shell={id}>
				<p class="integration-shell__label">ecopages--jsx-shell · {id}</p>
				<div class="integration-shell__body">{renderedChildren}</div>
			</section>
		);
	},
});
