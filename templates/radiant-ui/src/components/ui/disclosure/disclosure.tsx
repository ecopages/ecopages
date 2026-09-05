/**
 * Disclosure — `@ecopages/radiant-ui/disclosure`.
 *
 * `Disclosure` owns this component's stylesheet and lazy script, so listing it
 * in a page or layout `dependencies.components` ships everything it needs.
 *
 * The single disclosure is already composed: `trigger` stamps the summary row
 * and the collapsible panel around `children`.
 *
 * The accordion is the part people miss. Stacked disclosures stay independent
 * until a `<rui-disclosure-group>` coordinates them, and without it every panel
 * can be open at once — so `DisclosureGroup` is exported alongside, and takes
 * its panels as `items` rather than as hand-written children.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiDisclosure,
	RuiDisclosureGroup,
	type RuiDisclosureElement,
	type RuiDisclosureGroupElement,
	type RuiDisclosureGroupProps,
	type RuiDisclosureProps,
} from '@ecopages/radiant-ui/disclosure';

export type DisclosureProps = JsxCustomElementAttributes<
	RuiDisclosureElement,
	RuiDisclosureProps & { trigger?: JsxRenderable }
>;

export type DisclosureItem = {
	/** The summary row. */
	trigger: JsxRenderable;
	content: JsxRenderable;
	/** Open on first render. */
	open?: boolean;
};

export type DisclosureGroupProps = JsxCustomElementAttributes<RuiDisclosureGroupElement, RuiDisclosureGroupProps> & {
	/** One disclosure per entry. */
	items?: DisclosureItem[];
	children?: JsxRenderable;
};

export const Disclosure = eco.component<DisclosureProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./disclosure.css'],
		scripts: [{ src: './disclosure.script.ts', lazy: { 'on:idle': true } }],
	},
	render: RuiDisclosure,
});

export const DisclosureGroup = eco.component<DisclosureGroupProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./disclosure.css'],
		scripts: [{ src: './disclosure.script.ts', lazy: { 'on:idle': true } }],
	},
	render: ({ items, children, ...props }) => (
		<RuiDisclosureGroup {...props}>
			{items
				? items.map((item) => (
						<RuiDisclosure trigger={item.trigger} open={item.open}>
							{item.content}
						</RuiDisclosure>
					))
				: children}
		</RuiDisclosureGroup>
	),
});
