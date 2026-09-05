/**
 * Hero — the opening band of a page.
 *
 * Two layouts from one component: with `media` it splits into a text column and
 * a media column; without, the copy centres on its own. `align` overrides that
 * default when a split hero should still read centred, or a text-only hero
 * should stay left-aligned.
 *
 * The copy comes from `eyebrow` / `title` / `description` and renders through
 * `Heading`, so it inherits the same type scale as every other section header
 * on the page.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { cx } from '@/lib/cx';
import { Heading } from '@/components/ui/heading';
import { Section, type SectionProps } from '../section';

export type HeroProps = Pick<SectionProps, 'width' | 'tinted' | 'class'> & {
	/** Small label above the title. */
	eyebrow?: JsxRenderable;
	title: JsxRenderable;
	description?: JsxRenderable;
	/** Buttons or links under the copy. */
	actions?: JsxRenderable;
	/** Image, illustration or embed beside the copy. */
	media?: JsxRenderable;
	/** Text alignment. Defaults to `start` when there is `media`, `center` otherwise. */
	align?: 'start' | 'center';
	/** Puts the media column first. */
	mediaFirst?: boolean;
};

export const Hero = eco.component<HeroProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./hero.css'],
		components: [Section, Heading],
	},
	render: ({ eyebrow, title, description, actions, media, align, mediaFirst, class: className, ...section }) => {
		const hasMedia = media != null;
		const alignment = align ?? (hasMedia ? 'start' : 'center');

		return (
			<Section {...section} spacing="lg" class={cx('hero', className)}>
				<div
					class={cx(
						'hero__layout',
						hasMedia && 'hero__layout--split',
						mediaFirst && 'hero__layout--reversed',
					)}
				>
					<div class={cx('hero__copy', `hero__copy--${alignment}`)}>
						<Heading
							size="lg"
							align={alignment}
							eyebrow={eyebrow}
							title={title}
							titleAs="h1"
							description={description}
						/>
						{actions ? <div class="hero__actions">{actions}</div> : null}
					</div>
					{hasMedia ? <div class="hero__media">{media}</div> : null}
				</div>
			</Section>
		);
	},
});
