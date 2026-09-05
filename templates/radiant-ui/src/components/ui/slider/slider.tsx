/**
 * Slider — `@ecopages/radiant-ui/slider`.
 *
 * `Slider` owns this component's stylesheet and lazy script, so listing it in a page or
 * layout `dependencies.components` ships everything it needs.
 *
 * The host draws the track, the thumbs and the optional value readout, and
 * `values` — a `[min, max]` pair — makes it a range. Its own `label` is the
 * thumbs' accessible name — wrap it in `Field` for a visible one.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import { RuiSlider, type RuiSliderElement, type RuiSliderProps } from '@ecopages/radiant-ui/slider';

export type SliderProps = JsxCustomElementAttributes<RuiSliderElement, RuiSliderProps & { values?: [number, number] }>;

export const Slider = eco.component<SliderProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./slider.css'],
		scripts: [{ src: './slider.script.ts', lazy: { 'on:idle': true } }],
	},
	render: RuiSlider,
});
