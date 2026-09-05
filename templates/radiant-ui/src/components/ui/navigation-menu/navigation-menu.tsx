/**
 * NavigationMenu — `@ecopages/radiant-ui/navigation-menu`.
 *
 * `NavigationMenu` owns this component's stylesheet and lazy script, so listing
 * it in a page or layout `dependencies.components` ships everything it needs.
 *
 * Like `Tabs`, the bar and the panels are separate subtrees paired by a shared
 * `value` — and an entry is either a plain link or a trigger with a panel, two
 * different shapes in the same bar.
 *
 * Pass `items`: entries with `href` become links, entries with `panel` become
 * triggers and get their panel emitted below the bar.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiNavigationMenu,
	RuiNavigationMenuBar,
	RuiNavigationMenuLink,
	RuiNavigationMenuPanel,
	RuiNavigationMenuPanels,
	RuiNavigationMenuTrigger,
	type RuiNavigationMenuElement,
	type RuiNavigationMenuProps,
} from '@ecopages/radiant-ui/navigation-menu';
import { Button } from '../button';

export type NavigationMenuItem = {
	/** Unique key. Links may omit it. */
	value?: string;
	label: JsxRenderable;
	/** Renders a plain link. Ignored when `panel` is set. */
	href?: string;
	/** Renders a trigger plus the panel it reveals. */
	panel?: JsxRenderable;
};

export type NavigationMenuProps = JsxCustomElementAttributes<RuiNavigationMenuElement, RuiNavigationMenuProps> & {
	items?: NavigationMenuItem[];
	children?: JsxRenderable;
};

export const NavigationMenu = eco.component<NavigationMenuProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./navigation-menu.css'],
		scripts: [{ src: './navigation-menu.script.ts', lazy: { 'on:idle': true } }],
		components: [Button],
	},
	render: ({ items, children, ...props }) => {
		if (!items) {
			return <RuiNavigationMenu {...props}>{children}</RuiNavigationMenu>;
		}

		const withPanels = items.filter((item) => item.panel != null && item.value != null);

		return (
			<RuiNavigationMenu {...props}>
				<RuiNavigationMenuBar>
					{items.map((item) =>
						item.panel != null && item.value != null ? (
							<RuiNavigationMenuTrigger value={item.value}>{item.label}</RuiNavigationMenuTrigger>
						) : (
							<RuiNavigationMenuLink href={item.href ?? '#'}>{item.label}</RuiNavigationMenuLink>
						),
					)}
				</RuiNavigationMenuBar>
				{withPanels.length > 0 ? (
					<RuiNavigationMenuPanels>
						{withPanels.map((item) => (
							<RuiNavigationMenuPanel value={item.value as string}>{item.panel}</RuiNavigationMenuPanel>
						))}
					</RuiNavigationMenuPanels>
				) : null}
			</RuiNavigationMenu>
		);
	},
});
