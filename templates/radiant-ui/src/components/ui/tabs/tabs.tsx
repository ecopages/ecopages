/**
 * Tabs — `@ecopages/radiant-ui/tabs`.
 *
 * `Tabs` owns this component's stylesheet and lazy script, so listing it in a
 * page or layout `dependencies.components` ships everything it needs.
 *
 * The primitive keeps the strip and the panels in two separate subtrees, paired
 * only by matching `id`s. Writing that out means repeating every id twice and
 * remembering to mark one tab and its panel `selected`, or the first render has
 * no visible panel at all.
 *
 * Pass `items` and each entry contributes both halves; the first is selected
 * unless another sets `selected`.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiTab,
	RuiTabList,
	RuiTabPanel,
	RuiTabPanels,
	RuiTabs,
	type RuiTabsElement,
	type RuiTabsProps,
} from '@ecopages/radiant-ui/tabs';

export type TabItem = {
	id: string;
	label: JsxRenderable;
	content: JsxRenderable;
	disabled?: boolean;
	/** Selected on first render. Defaults to the first enabled entry. */
	selected?: boolean;
};

export type TabsProps = JsxCustomElementAttributes<RuiTabsElement, RuiTabsProps> & {
	/** One entry per tab, each carrying both its control and its panel. */
	items?: TabItem[];
	/** Accessible name for the tab strip. */
	label?: string;
	children?: JsxRenderable;
};

export const Tabs = eco.component<TabsProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./tabs.css'],
		scripts: [{ src: './tabs.script.ts', lazy: { 'on:idle': true } }],
	},
	render: ({ items, label, children, ...props }) => {
		if (!items) {
			return <RuiTabs {...props}>{children}</RuiTabs>;
		}

		const fallback = items.find((item) => !item.disabled) ?? items[0];
		const selectedId = items.find((item) => item.selected)?.id ?? fallback?.id;

		return (
			<RuiTabs {...props}>
				<RuiTabList aria-label={label}>
					{items.map((item) => (
						<RuiTab id={item.id} disabled={item.disabled} selected={item.id === selectedId}>
							{item.label}
						</RuiTab>
					))}
				</RuiTabList>
				<RuiTabPanels>
					{items.map((item) => (
						<RuiTabPanel id={item.id} selected={item.id === selectedId}>
							{item.content}
						</RuiTabPanel>
					))}
				</RuiTabPanels>
			</RuiTabs>
		);
	},
});
