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
 *
 * `pattern` is encoded before paint so the RegExp survives SSR. The listed
 * script revives it when the host connects.
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
import { Label } from '../label';
import { encodeFieldRules } from './field-rules';

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
		scripts: [{ src: './field-revive.script.ts', lazy: { 'on:idle': true } }],
		components: [Label],
	},
	render: ({ label, description, children, rules, ...props }) => (
		<RuiField {...props} rules={encodeFieldRules(rules)}>
			{label ? <Label>{label}</Label> : null}
			{children}
			{description ? <RuiFieldDescription>{description}</RuiFieldDescription> : null}
			<RuiFieldError />
		</RuiField>
	),
});
