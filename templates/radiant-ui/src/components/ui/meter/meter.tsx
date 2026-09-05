/**
 * Meter — `@ecopages/radiant-ui/meter`.
 *
 * `Meter` owns this component's stylesheet and lazy script, so listing it in a
 * page or layout `dependencies.components` ships everything it needs.
 *
 * A `role="meter"` gauge for a known-range measurement — disk usage, a score.
 * The host renders the whole thing from `value`, `min` and `max`. For progress
 * toward completion, use a progress bar instead.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import { RuiMeter, type RuiMeterElement, type RuiMeterProps } from '@ecopages/radiant-ui/meter';

export type MeterProps = JsxCustomElementAttributes<RuiMeterElement, RuiMeterProps>;

export const Meter = eco.component<MeterProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./meter.css'],
		scripts: [{ src: './meter.script.ts', lazy: { 'on:idle': true } }],
	},
	render: RuiMeter,
});
