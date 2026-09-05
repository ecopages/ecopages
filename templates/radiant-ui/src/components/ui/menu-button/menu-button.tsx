/**
 * MenuButton — `@ecopages/radiant-ui/menu-button`.
 *
 * `MenuButton` owns this component's stylesheet and lazy script, so listing it
 * in a page or layout `dependencies.components` ships everything it needs.
 *
 * Already composed: pass `trigger` and `items` and the button, the floating
 * menu and its entries — including separators and submenus — are stamped for
 * you.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiMenuButton,
	type RuiMenuButtonElement,
	type RuiMenuButtonProps,
	type RuiMenuEntry,
} from '@ecopages/radiant-ui/menu-button';
import { Button } from '../button';
import { Separator } from '../separator';

export type MenuButtonProps = JsxCustomElementAttributes<
	RuiMenuButtonElement,
	RuiMenuButtonProps & { trigger?: JsxRenderable; items?: RuiMenuEntry[] }
>;

export const MenuButton = eco.component<MenuButtonProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['../primitives.css', './menu-button.css'],
		scripts: [{ src: './menu-button.script.ts', lazy: { 'on:idle': true } }],
		components: [Button, Separator],
	},
	render: RuiMenuButton,
});
