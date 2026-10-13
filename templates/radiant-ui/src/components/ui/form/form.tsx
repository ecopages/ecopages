/**
 * Form — `@ecopages/radiant-ui/form`.
 *
 * `Form` owns this component's stylesheet and lazy script, so listing it in a
 * page or layout `dependencies.components` ships everything it needs.
 *
 * The form host owns a validation store: it registers every descendant `Field`,
 * runs their `rules` on the mode you pick, and paints errors back into each
 * field's error slot. Without a `Form` ancestor, `rules` are inert.
 *
 * This adds the part every form needs anyway — a submit row. Pass `submitLabel`
 * for the common case, or `actions` when the row needs more than one control.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import { RuiForm, type RuiFormElement, type RuiFormProps } from '@ecopages/radiant-ui/form';
import { Button } from '../button';

export type FormProps = JsxCustomElementAttributes<RuiFormElement, RuiFormProps> & {
	/** Renders a single submit button after the fields. */
	submitLabel?: string;
	/** Full control over the action row. Takes precedence over `submitLabel`. */
	actions?: JsxRenderable;
	children?: JsxRenderable;
};

export const Form = eco.component<FormProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./form.css'],
		scripts: [{ src: './form.script.ts', lazy: { 'on:idle': true } }],
		components: [Button],
	},
	render: ({ submitLabel, actions, children, ...props }) => (
		<RuiForm {...props}>
			{children}
			{actions ?? (submitLabel ? <Button type="submit">{submitLabel}</Button> : null)}
		</RuiForm>
	),
});
