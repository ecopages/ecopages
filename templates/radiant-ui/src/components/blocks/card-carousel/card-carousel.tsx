/**
 * CardCarousel — a horizontally rotating strip of cards.
 *
 * `Carousel` handles the hard part — the live region, the rotation control, the
 * keyboard model — but it wants slides as `{ id, children }` pairs. This turns
 * a list of cards into those pairs and gives each one the same surface, so a
 * testimonial strip and a product strip look like the same design.
 *
 * `perView` controls how many cards share a slide on a wide screen; below that
 * they collapse to one, because a two-up carousel on a phone is unreadable.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { cx } from '@/lib/cx';
import { Carousel } from '@/components/ui/carousel';
import { Section, SectionHeading, type SectionProps } from '../section';

export type CarouselCard = {
	id: string;
	/** Image or illustration above the copy. */
	media?: JsxRenderable;
	title?: JsxRenderable;
	description?: JsxRenderable;
	/** Anything below the copy — a byline, a price, a button. */
	footer?: JsxRenderable;
	/** Replaces the whole card body. */
	content?: JsxRenderable;
};

export type CardCarouselProps = Pick<SectionProps, 'width' | 'tinted' | 'spacing' | 'inset' | 'class'> & {
	eyebrow?: JsxRenderable;
	title?: JsxRenderable;
	description?: JsxRenderable;
	cards: CarouselCard[];
	/** Cards per slide on a wide screen. Default: 3. */
	perView?: 1 | 2 | 3;
	/** Accessible name for the carousel. */
	label?: string;
	/** Rotates on its own until the reader interacts. */
	autoplay?: boolean;
};

function card(entry: CarouselCard): JsxRenderable {
	if (entry.content) return <article class="card-carousel__card">{entry.content}</article>;

	return (
		<article class="card-carousel__card">
			{entry.media ? <div class="card-carousel__media">{entry.media}</div> : null}
			<div class="card-carousel__body">
				{entry.title ? <h3 class="card-carousel__title">{entry.title}</h3> : null}
				{entry.description ? <p class="card-carousel__text">{entry.description}</p> : null}
			</div>
			{entry.footer ? <div class="card-carousel__footer">{entry.footer}</div> : null}
		</article>
	);
}

/** Chunks the cards into slides of `perView`. */
function toSlides(cards: CarouselCard[], perView: number) {
	const slides = [];

	for (let index = 0; index < cards.length; index += perView) {
		const group = cards.slice(index, index + perView);
		slides.push({
			id: group[0].id,
			children: <div class="card-carousel__group">{group.map(card)}</div>,
		});
	}

	return slides;
}

export const CardCarousel = eco.component<CardCarouselProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./card-carousel.css'],
		components: [Section, SectionHeading, Carousel],
	},
	render: ({ eyebrow, title, description, cards, perView = 3, label, autoplay, class: className, ...section }) => (
		<Section {...section} class={cx('card-carousel', `card-carousel--${perView}`, className)}>
			<SectionHeading class="card-carousel__heading" eyebrow={eyebrow} title={title} description={description} />
			<Carousel label={label} autoplay={autoplay} slides={toSlides(cards, perView)} showIndicators />
		</Section>
	),
});
