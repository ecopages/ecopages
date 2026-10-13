/**
 * Label — `@ecopages/radiant-ui/label`.
 *
 * `Label` owns this component's stylesheet, so listing it in a page or layout
 * `dependencies.components` ships everything it needs.
 *
 * `Field` renders one for you and handles the control association; reach for
 * this directly only outside a field.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiLabel, type RuiLabelProps } from '@ecopages/radiant-ui/label';

export type LabelProps = RuiLabelProps;

export const Label = eco.component<LabelProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./label.css'],
	},
	render: RuiLabel,
});
