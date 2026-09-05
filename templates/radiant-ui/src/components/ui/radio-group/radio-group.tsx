/**
 * RadioGroup — `@ecopages/radiant-ui/radio-group`.
 *
 * `RadioGroup` owns this component's stylesheet and lazy script, so listing it in a page or
 * layout `dependencies.components` ships everything it needs.
 *
 * The primitive is already data-driven: `options` renders each radio and the
 * group's roving-focus keyboard model. It renders no visible group label, so
 * wrap it in `Field` — which for a radio group is the difference between a
 * labelled fieldset and three loose buttons.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiRadioGroup,
	type RuiRadioGroupElement,
	type RuiRadioGroupProps,
	type RuiRadioOption,
} from '@ecopages/radiant-ui/radio-group';

export type RadioGroupProps = JsxCustomElementAttributes<
	RuiRadioGroupElement,
	RuiRadioGroupProps & { options?: RuiRadioOption[] }
>;

export const RadioGroup = eco.component<RadioGroupProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./radio-group.css'],
		scripts: [{ src: './radio-group.script.ts', lazy: { 'on:idle': true } }],
	},
	/** The radios share the group's `name`, so it stays on the control here. */
	render: RuiRadioGroup,
});
