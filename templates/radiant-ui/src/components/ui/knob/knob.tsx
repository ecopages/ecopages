/**
 * Knob — `@ecopages/radiant-ui/knob`.
 *
 * `Knob` owns this component's stylesheet and lazy script, so listing it in a
 * page or layout `dependencies.components` ships everything it needs.
 *
 * A rotary `role="slider"`. The host draws the ring, the value readout and the
 * pointer handling from `min`, `max`, `step` and `value` — there are no parts.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import { RuiKnob, type RuiKnobElement, type RuiKnobProps } from '@ecopages/radiant-ui/knob';

export type KnobProps = JsxCustomElementAttributes<RuiKnobElement, RuiKnobProps>;

export const Knob = eco.component<KnobProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./knob.css'],
		scripts: [{ src: './knob.script.ts', lazy: { 'on:idle': true } }],
	},
	render: RuiKnob,
});
