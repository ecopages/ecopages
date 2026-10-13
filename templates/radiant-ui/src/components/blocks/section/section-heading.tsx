/**
 * SectionHeading — the centred header most blocks open with.
 *
 * Every block that can carry a header carries the same three optional props and
 * the same "render nothing when all three are empty" rule. Left in each block
 * that is five copies of one conditional, and five chances for one of them to
 * drift out of alignment with the rest.
 *
 * Blocks pass their three props straight through; this decides whether there is
 * a header at all.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { Heading } from '@/components/ui/heading';

export type SectionHeadingProps = {
	eyebrow?: JsxRenderable;
	title?: JsxRenderable;
	description?: JsxRenderable;
	/** Spacing hook for the block that owns it. */
	class?: string;
};

export const SectionHeading = eco.component<SectionHeadingProps, JsxRenderable>({
	dependencies: { components: [Heading] },
	render: ({ eyebrow, title, description, class: className }) =>
		eyebrow == null && title == null && description == null ? null : (
			<Heading class={className} align="center" eyebrow={eyebrow} title={title} description={description} />
		),
});
