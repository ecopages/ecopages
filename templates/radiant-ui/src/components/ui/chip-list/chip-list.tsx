/**
 * ChipList — `@ecopages/radiant-ui/chip-list`.
 *
 * `ChipList` owns this component's stylesheet, so listing it in a page or
 * layout `dependencies.components` ships everything it needs.
 *
 * A `<ul>` of chips. The primitive needs one `RuiChipListItem` per entry, which
 * is pure boilerplate when the chips come from data.
 *
 * Pass `items` and each one is wrapped; pass `children` instead when the list
 * items need their own markup.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiChipList, RuiChipListItem, type RuiChipListProps } from '@ecopages/radiant-ui/chip-list';

export type ChipListProps = Omit<RuiChipListProps, 'children'> & {
	/** One list item per entry. */
	items?: JsxRenderable[];
	children?: JsxRenderable;
};

export const ChipList = eco.component<ChipListProps, JsxRenderable>({
	dependencies: { stylesheets: ['./chip-list.css'] },
	render: ({ items, children, ...props }) => (
		<RuiChipList {...props}>
			{items ? items.map((item) => <RuiChipListItem>{item}</RuiChipListItem>) : children}
		</RuiChipList>
	),
});
