/**
 * Headline — `@ecopages/radiant-ui/headline`.
 *
 * `Headline` owns this component's stylesheet, so listing it in a page or
 * layout `dependencies.components` ships everything it needs.
 *
 * One display-scale heading; `as` picks the level. For an eyebrow + title +
 * description stack use `Heading`.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiHeadline, type RuiHeadlineAs, type RuiHeadlineProps } from '@ecopages/radiant-ui/headline';

export type HeadlineProps = RuiHeadlineProps<RuiHeadlineAs>;

export const Headline = eco.component<HeadlineProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./headline.css'],
	},
	render: RuiHeadline,
});
