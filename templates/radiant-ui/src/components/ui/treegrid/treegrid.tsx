/**
 * Treegrid — `@ecopages/radiant-ui/treegrid`.
 *
 * `Treegrid` owns this component's stylesheet and lazy script, so listing it in
 * a page or layout `dependencies.components` ships everything it needs.
 *
 * A tree and a grid at once — expandable rows with navigable cells. Already
 * data-driven: pass `columns` and `rows`. The script waits for it to become
 * visible.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiTreegrid,
	type RuiTreegridElement,
	type RuiTreegridProps,
	type RuiTreegridRow,
} from '@ecopages/radiant-ui/treegrid';

export type TreegridProps = JsxCustomElementAttributes<
	RuiTreegridElement,
	RuiTreegridProps & { columns?: JsxRenderable[]; rows?: RuiTreegridRow[] }
>;

export const Treegrid = eco.component<TreegridProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./treegrid.css'],
		scripts: [{ src: './treegrid.script.ts', lazy: { 'on:visible': true } }],
	},
	render: RuiTreegrid,
});
