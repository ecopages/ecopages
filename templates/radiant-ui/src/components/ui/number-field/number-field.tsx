/**
 * NumberField — `@ecopages/radiant-ui/number-field`.
 *
 * `NumberField` owns this component's stylesheet and lazy script, so listing it in a page or
 * layout `dependencies.components` ships everything it needs.
 *
 * With no children the host stamps the input and its increment and decrement
 * steppers. Its own `label` is the input's accessible name — wrap it in `Field`
 * for a visible one.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiNumberField,
	type RuiNumberFieldElement,
	type RuiNumberFieldProps,
} from '@ecopages/radiant-ui/number-field';

export type NumberFieldProps = JsxCustomElementAttributes<RuiNumberFieldElement, RuiNumberFieldProps>;

export const NumberField = eco.component<NumberFieldProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./number-field.css'],
		scripts: [{ src: './number-field.script.ts', lazy: { 'on:idle': true } }],
	},
	render: RuiNumberField,
});
