/**
 * Grid — `@ecopages/radiant-ui/grid`.
 *
 * `Grid` owns this component's stylesheet and lazy script, so listing it in a
 * page or layout `dependencies.components` ships everything it needs.
 *
 * An APG interactive grid, not a CSS one — arrow keys move a roving focus
 * between cells. Already data-driven: pass `rows` as an array of cell arrays.
 * The script waits for the grid to scroll into view.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import { RuiGrid, type RuiGridElement, type RuiGridProps } from '@ecopages/radiant-ui/grid';

export type GridProps = JsxCustomElementAttributes<RuiGridElement, RuiGridProps & { rows?: JsxRenderable[][] }>;

export const Grid = eco.component<GridProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./grid.css'],
		scripts: [{ src: './grid.script.ts', lazy: { 'on:visible': true } }],
	},
	render: RuiGrid,
});
