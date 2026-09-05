/**
 * Heading — `@ecopages/radiant-ui/heading`.
 *
 * `Heading` owns this component's stylesheet, so listing it in a page or layout
 * `dependencies.components` ships everything it needs.
 *
 * A section header is an optional eyebrow, a title, and an optional lead
 * paragraph — three separate primitives whose type scale is driven by the
 * wrapper's `size`. Writing them out every time is noise.
 *
 * Pass `eyebrow`, `title` and `description`. `children` still works for headers
 * that need something extra, such as an action next to the title.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import {
	RuiHeading,
	RuiHeadingDescription,
	RuiHeadingEyebrow,
	RuiHeadingTitle,
	type RuiHeadingProps,
	type RuiHeadingRootAs,
} from '@ecopages/radiant-ui/heading';
import type { RuiHeadlineAs } from '@ecopages/radiant-ui/headline';
import { Headline } from '../headline';

/**
 * `title` is omitted from the root's props before being redeclared: the DOM's
 * own `title` attribute is a `string`, and intersecting the two would demand a
 * value that is both a string and renderable JSX.
 */
export type HeadingProps = Omit<RuiHeadingProps<RuiHeadingRootAs>, 'title'> & {
	/** Small label above the title. */
	eyebrow?: JsxRenderable;
	/** The title itself. */
	title?: JsxRenderable;
	/** Heading level for the title. Default: `h2`. */
	titleAs?: RuiHeadlineAs;
	/** Lead paragraph under the title. */
	description?: JsxRenderable;
	children?: JsxRenderable;
};

export const Heading = eco.component<HeadingProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./heading.css'],
		components: [Headline],
	},
	render: ({ eyebrow, title, titleAs, description, children, ...props }) => (
		<RuiHeading {...props}>
			{eyebrow ? <RuiHeadingEyebrow>{eyebrow}</RuiHeadingEyebrow> : null}
			{title ? <RuiHeadingTitle as={titleAs}>{title}</RuiHeadingTitle> : null}
			{description ? <RuiHeadingDescription>{description}</RuiHeadingDescription> : null}
			{children}
		</RuiHeading>
	),
});
