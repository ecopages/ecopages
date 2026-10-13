/**
 * Button — `@ecopages/radiant-ui/button`.
 *
 * `Button` owns this component's stylesheet, so listing it in a page or layout
 * `dependencies.components` ships everything it needs.
 *
 * Whole on its own: variants and sizes are CSS, and passing `href` switches it
 * to a button-styled `<a>` with real link semantics.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton, type RuiButtonProps } from '@ecopages/radiant-ui/button';

export type ButtonProps = RuiButtonProps;

export const Button = eco.component<ButtonProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./button.css'],
	},
	render: RuiButton,
});
