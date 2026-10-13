/**
 * Pagination — `@ecopages/radiant-ui/pagination`.
 *
 * `Pagination` owns this component's stylesheet and lazy script, so listing it
 * in a page or layout `dependencies.components` ships everything it needs.
 *
 * Whole on its own: `page`, `pageCount` and `siblingCount` produce the numbered
 * nav, the previous/next controls and the ellipses. Supply children only to
 * replace that nav wholesale.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import { RuiPagination, type RuiPaginationElement, type RuiPaginationProps } from '@ecopages/radiant-ui/pagination';
import { Button } from '../button';

export type PaginationProps = JsxCustomElementAttributes<RuiPaginationElement, RuiPaginationProps> & {
	children?: JsxRenderable;
};

export const Pagination = eco.component<PaginationProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['../primitives.css', './pagination.css'],
		scripts: [{ src: './pagination.script.ts', lazy: { 'on:idle': true } }],
		components: [Button],
	},
	render: RuiPagination,
});
