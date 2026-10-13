/**
 * Toc — `@ecopages/radiant-ui/toc`.
 *
 * `Toc` owns this component's stylesheet and lazy script, so listing it in a
 * page or layout `dependencies.components` ships everything it needs.
 *
 * A table of contents that tracks the reading position. The host builds the
 * list from the headings it finds, so there is nothing to compose. Its script
 * waits until the list scrolls into view.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiToc, type RuiTocViewProps } from '@ecopages/radiant-ui/toc';

export type TocProps = RuiTocViewProps;

export const Toc = eco.component<TocProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./toc.css'],
		scripts: [{ src: './toc.script.ts', lazy: { 'on:visible': true } }],
	},
	render: RuiToc,
});
