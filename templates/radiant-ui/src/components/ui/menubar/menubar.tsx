/**
 * Menubar — `@ecopages/radiant-ui/menubar`.
 *
 * `Menubar` owns this component's stylesheet and lazy script, so listing it in
 * a page or layout `dependencies.components` ships everything it needs.
 *
 * Already data-driven: pass `items` — each a top-level menu with its own
 * entries — and the bar, the panels and the APG keyboard model follow.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiMenubar,
	type RuiMenubarElement,
	type RuiMenubarItem,
	type RuiMenubarProps,
} from '@ecopages/radiant-ui/menubar';
import { Separator } from '../separator';

export type MenubarProps = JsxCustomElementAttributes<
	RuiMenubarElement,
	RuiMenubarProps & { items?: RuiMenubarItem[] }
>;

export const Menubar = eco.component<MenubarProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['../primitives.css', './menubar.css'],
		scripts: [{ src: './menubar.script.ts', lazy: { 'on:idle': true } }],
		components: [Separator],
	},
	render: RuiMenubar,
});
