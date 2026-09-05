/**
 * WindowSplitter — `@ecopages/radiant-ui/window-splitter`.
 *
 * `WindowSplitter` owns this component's stylesheet and lazy script, so listing
 * it in a page or layout `dependencies.components` ships everything it needs.
 *
 * Two resizable panes with a draggable, keyboard-operable separator between
 * them. Already composed: pass `primary` and `secondary`.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiWindowSplitter,
	type RuiWindowSplitterElement,
	type RuiWindowSplitterProps,
} from '@ecopages/radiant-ui/window-splitter';

export type WindowSplitterProps = JsxCustomElementAttributes<RuiWindowSplitterElement, RuiWindowSplitterProps> & {
	primary: JsxRenderable;
	secondary: JsxRenderable;
};

export const WindowSplitter = eco.component<WindowSplitterProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./window-splitter.css'],
		scripts: [{ src: './window-splitter.script.ts', lazy: { 'on:idle': true } }],
	},
	render: RuiWindowSplitter,
});
