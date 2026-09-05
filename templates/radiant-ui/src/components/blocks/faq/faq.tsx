/**
 * Faq — questions that expand one at a time.
 *
 * `RuiDisclosureGroup` is what makes an accordion an accordion: it closes the
 * open panel when another opens. The group is easy to leave out, and without it
 * every answer stays open at once — so it is always here, and `multiple` opts
 * back into independent panels.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { cx } from '@/lib/cx';
import { DisclosureGroup } from '@/components/ui/disclosure';
import { Section, SectionHeading, type SectionProps } from '../section';

export type FaqEntry = {
	question: JsxRenderable;
	answer: JsxRenderable;
	/** Open on first render. */
	open?: boolean;
};

export type FaqProps = Pick<SectionProps, 'width' | 'tinted' | 'spacing' | 'inset' | 'class'> & {
	eyebrow?: JsxRenderable;
	title?: JsxRenderable;
	description?: JsxRenderable;
	entries: FaqEntry[];
	/** Lets several answers stay open at once. */
	multiple?: boolean;
};

export const Faq = eco.component<FaqProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./faq.css'],
		components: [Section, SectionHeading, DisclosureGroup],
	},
	render: ({ eyebrow, title, description, entries, multiple, class: className, ...section }) => (
		<Section {...section} width="narrow" class={cx('faq', className)}>
			<SectionHeading class="faq__heading" eyebrow={eyebrow} title={title} description={description} />
			<DisclosureGroup
				class="faq__list"
				multiple={multiple}
				items={entries.map((entry) => ({ trigger: entry.question, content: entry.answer, open: entry.open }))}
			/>
		</Section>
	),
});
