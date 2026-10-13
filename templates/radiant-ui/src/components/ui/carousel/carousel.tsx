/**
 * Carousel — `@ecopages/radiant-ui/carousel`.
 *
 * `Carousel` owns this component's stylesheet and lazy script, so listing it in
 * a page or layout `dependencies.components` ships everything it needs, `Button`
 * chrome for the arrows included.
 *
 * Already data-driven: pass `slides` and the track, the controls and the live
 * region are stamped for you. Pass `children` for slides that need custom
 * markup. The script waits for the carousel to become visible.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiCarousel,
	type RuiCarouselElement,
	type RuiCarouselProps,
	type RuiCarouselSlideData,
} from '@ecopages/radiant-ui/carousel';
import { Button } from '../button';

export type CarouselProps = JsxCustomElementAttributes<
	RuiCarouselElement,
	RuiCarouselProps & {
		slides?: RuiCarouselSlideData[];
		prev?: JsxRenderable;
		next?: JsxRenderable;
		rotation?: JsxRenderable;
	}
>;

export const Carousel = eco.component<CarouselProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./carousel.css'],
		scripts: [{ src: './carousel.script.ts', lazy: { 'on:visible': true } }],
		components: [Button],
	},
	render: RuiCarousel,
});
