/**
 * Toolbar — `@ecopages/radiant-ui/toolbar`.
 *
 * `Toolbar` owns this component's stylesheet and lazy script, so listing it in
 * a page or layout `dependencies.components` ships everything it needs.
 *
 * A `role="toolbar"` row: the host takes over arrow-key navigation between the
 * controls in `children`, so give it a `label` and put `Button`s (or a
 * `Separator` between groups) inside.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import { RuiToolbar, type RuiToolbarElement, type RuiToolbarProps } from '@ecopages/radiant-ui/toolbar';

export type ToolbarProps = JsxCustomElementAttributes<RuiToolbarElement, RuiToolbarProps>;

export const Toolbar = eco.component<ToolbarProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./toolbar.css'],
		scripts: [{ src: './toolbar.script.ts', lazy: { 'on:idle': true } }],
	},
	render: RuiToolbar,
});
