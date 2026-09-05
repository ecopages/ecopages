/**
 * Field — `@ecopages/radiant-ui/field`.
 *
 * `Field` owns this component's stylesheet and lazy script, so listing it in a
 * page or layout `dependencies.components` ships everything it needs.
 *
 * A field is a label, a control, a hint and an error message in that order. The
 * primitive leaves all four to you, and the error slot in particular is a
 * self-closing `<RuiFieldError />` the host fills in later — easy to forget,
 * and without it validation messages never appear.
 *
 * Pass `label` and `description`, put the control in `children`, and the error
 * slot is always there. Validation `rules` only fire inside a `Form`;
 * standalone, drive the message yourself with `error` and `invalid`.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiField,
	RuiFieldDescription,
	RuiFieldError,
	type RuiFieldElement,
	type RuiFieldProps,
} from '@ecopages/radiant-ui/field';
import { RuiLabel } from '@ecopages/radiant-ui/label';
import { Label } from '../label';

export type FieldProps = JsxCustomElementAttributes<RuiFieldElement, RuiFieldProps> & {
	/** Field label. The host associates it with the control. */
	label?: JsxRenderable;
	/** Hint under the control, wired up as `aria-describedby`. */
	description?: JsxRenderable;
	children?: JsxRenderable;
};

export const Field = eco.component<FieldProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./field.css'],
		scripts: [{ src: './field.script.ts', lazy: { 'on:idle': true } }],
		components: [Label],
	},
	render: ({ label, description, children, ...props }) => (
		<RuiField {...props}>
			{label ? <RuiLabel>{label}</RuiLabel> : null}
			{children}
			{description ? <RuiFieldDescription>{description}</RuiFieldDescription> : null}
			<RuiFieldError />
		</RuiField>
	),
});
