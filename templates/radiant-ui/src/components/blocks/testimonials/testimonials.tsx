/**
 * Testimonials — quotes with attribution.
 *
 * A `<blockquote>` plus a `<figcaption>` is the markup that actually says "this
 * is a quotation and this person said it"; a stack of divs does not. Each entry
 * gets that pairing, with the avatar and role folded into the caption.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { cx } from '@/lib/cx';
import { Avatar } from '@/components/ui/avatar';
import { Section, SectionHeading, type SectionProps } from '../section';

export type Testimonial = {
	quote: JsxRenderable;
	author: string;
	/** Job title, company, or both. */
	role?: JsxRenderable;
	/** Avatar image. Initials are derived from `author` when absent. */
	avatarSrc?: string;
};

export type TestimonialsProps = Pick<SectionProps, 'width' | 'tinted' | 'spacing' | 'class'> & {
	eyebrow?: JsxRenderable;
	title?: JsxRenderable;
	description?: JsxRenderable;
	testimonials: Testimonial[];
};

/** `Jane Cooper` → `JC`, for the avatar fallback. */
function initials(name: string): string {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('');
}

export const Testimonials = eco.component<TestimonialsProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./testimonials.css'],
		components: [Section, SectionHeading, Avatar],
	},
	render: ({ eyebrow, title, description, testimonials, class: className, ...section }) => (
		<Section {...section} class={cx('testimonials', className)}>
			<SectionHeading class="testimonials__heading" eyebrow={eyebrow} title={title} description={description} />
			<div class="testimonials__list">
				{testimonials.map((entry) => (
					<figure class="testimonials__item">
						<blockquote class="testimonials__quote">{entry.quote}</blockquote>
						<figcaption class="testimonials__author">
							<Avatar
								src={entry.avatarSrc}
								alt={entry.author}
								fallback={initials(entry.author)}
								size="sm"
							/>
							<span class="testimonials__author-text">
								<span class="testimonials__name">{entry.author}</span>
								{entry.role ? <span class="testimonials__role">{entry.role}</span> : null}
							</span>
						</figcaption>
					</figure>
				))}
			</div>
		</Section>
	),
});
