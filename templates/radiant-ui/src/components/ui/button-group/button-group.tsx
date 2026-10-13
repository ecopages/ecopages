/**
 * ButtonGroup — `@ecopages/radiant-ui/button-group`.
 *
 * `ButtonGroup` owns this component's stylesheet, so listing it in a page or
 * layout `dependencies.components` ships everything it needs. It also pulls in
 * `Button`, since the group only styles the seams between its children.
 *
 * Put `Button`s in `children` — segmented, in the order you write them.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButtonGroup, type RuiButtonGroupProps } from '@ecopages/radiant-ui/button-group';
import { Button } from '../button';

export type ButtonGroupProps = RuiButtonGroupProps;

export const ButtonGroup = eco.component<ButtonGroupProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./button-group.css'],
		components: [Button],
	},
	render: RuiButtonGroup,
});
