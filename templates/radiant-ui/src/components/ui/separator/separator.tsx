/**
 * Separator — `@ecopages/radiant-ui/separator`.
 *
 * `Separator` owns this component's stylesheet, so listing it in a page or
 * layout `dependencies.components` ships everything it needs.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiSeparator, type RuiSeparatorProps } from '@ecopages/radiant-ui/separator';

export type SeparatorProps = RuiSeparatorProps;

export const Separator = eco.component<SeparatorProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./separator.css'],
	},
	render: RuiSeparator,
});
