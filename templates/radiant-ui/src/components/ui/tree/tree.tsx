/**
 * Tree — `@ecopages/radiant-ui/tree`.
 *
 * `Tree` owns this component's stylesheet and lazy script, so listing it in a
 * page or layout `dependencies.components` ships everything it needs.
 *
 * Already data-driven: pass `nodes` — each with optional `children` — and the
 * roles, expand state and APG keyboard model follow. The script waits for the
 * tree to scroll into view.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import { RuiTree, type RuiTreeElement, type RuiTreeNode, type RuiTreeProps } from '@ecopages/radiant-ui/tree';

export type TreeProps = JsxCustomElementAttributes<RuiTreeElement, RuiTreeProps & { nodes?: RuiTreeNode[] }>;

export const Tree = eco.component<TreeProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./tree.css'],
		scripts: [{ src: './tree.script.ts', lazy: { 'on:visible': true } }],
	},
	render: RuiTree,
});
