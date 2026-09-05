/**
 * TextMedia — a band of copy next to an image, alternating sides down the page.
 *
 * The classic marketing row. `reverse` flips which side the media sits on, so a
 * sequence of these alternates by toggling one prop rather than by writing two
 * near-identical components.
 *
 * On narrow screens the columns stack with the media first, because a picture
 * reads faster than a paragraph when you are scrolling.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { cx } from '@/lib/cx';
import { Heading } from '@/components/ui/heading';
import { Section, type SectionProps } from '../section';

export type TextMediaProps = Pick<SectionProps, 'width' | 'tinted' | 'spacing' | 'class'> & {
	eyebrow?: JsxRenderable;
	title: JsxRenderable;
	description?: JsxRenderable;
	/** Extra content under the description — a list, a quote, anything. */
	children?: JsxRenderable;
	/** Buttons or links under the copy. */
	actions?: JsxRenderable;
	media: JsxRenderable;
	/** Puts the media on the left instead of the right. */
	reverse?: boolean;
};

export const TextMedia = eco.component<TextMediaProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./text-media.css'],
		components: [Section, Heading],
	},
	render: ({ eyebrow, title, description, children, actions, media, reverse, class: className, ...section }) => (
		<Section {...section} class={cx('text-media', className)}>
			<div class={cx('text-media__layout', reverse && 'text-media__layout--reverse')}>
				<div class="text-media__copy">
					<Heading eyebrow={eyebrow} title={title} description={description} />
					{children}
					{actions ? <div class="text-media__actions">{actions}</div> : null}
				</div>
				<div class="text-media__media">{media}</div>
			</div>
		</Section>
	),
});
