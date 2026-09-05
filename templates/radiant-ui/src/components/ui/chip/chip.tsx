/**
 * Chip — `@ecopages/radiant-ui/chip`.
 *
 * `Chip` owns this component's stylesheet, so listing it in a page or layout
 * `dependencies.components` ships everything it needs.
 *
 * A static token. For a removable, keyboard-navigable set use `TagGroup`; to
 * lay several out as a list use `ChipList`.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiChip, type RuiChipProps } from '@ecopages/radiant-ui/chip';

export type ChipProps = RuiChipProps;

export const Chip = eco.component<ChipProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./chip.css'],
	},
	render: RuiChip,
});
